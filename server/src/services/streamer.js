import { Api } from 'telegram';
import { getTelegramClient } from './telegram.js';
import bigInt from 'big-integer';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { PassThrough } from 'stream';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const SUPPORTED_NATIVE_MIMES = ['video/mp4', 'video/webm', 'video/ogg', 'video/mp2t'];

// Infer MIME from filename when Telegram/DB stores a generic or empty type
const EXT_TO_MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv',
  '.mpeg': 'video/mpeg', '.mpg': 'video/mpeg',
  '.ts': 'video/mp2t',
  '.ogg': 'video/ogg', '.ogv': 'video/ogg',
};

function inferMimeType(fileName, storedMime) {
  // If the stored MIME is a known video type, trust it
  if (storedMime && storedMime.startsWith('video/')) {
    return storedMime;
  }
  // Otherwise infer from file extension
  if (fileName) {
    const ext = '.' + fileName.split('.').pop().toLowerCase();
    if (EXT_TO_MIME[ext]) {
      return EXT_TO_MIME[ext];
    }
  }
  // Fallback
  return storedMime || 'video/mp4';
}

/**
 * Streams a file from Telegram to an Express response with HTTP 206 support.
 *
 * @param {Object} media - The Media mongoose document
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function streamMedia(media, req, res) {
  const client = getTelegramClient();
  const channelId = media.telegramChannelId;
  const messageId = media.telegramMessageId;

  try {
    // Fetch the message to get fresh file reference
    const messages = await client.getMessages(channelId, {
      ids: [messageId]
    });

    if (!messages || messages.length === 0 || !messages[0]) {
      return res.status(404).json({ error: 'Telegram message not found' });
    }

    const message = messages[0];

    if (!message.media || !message.media.document) {
      return res.status(404).json({ error: 'No video document in message' });
    }

    const document = message.media.document;
    const fileSize = Number(document.size);
    // Infer the real MIME type from the filename if the stored/Telegram type is unreliable
    let mimeType = inferMimeType(media.fileName, media.mimeType || document.mimeType);

    // ─── Subtitle Handling (Fully buffering & converting) ───
    if (media.type === 'subtitle' || fileNameIsSub(media.fileName)) {
      return await serveSubtitle(client, document, media.fileName, res);
    }

    // ─── Native vs Transcode Detection ───
    const isRaw = req.query && req.query.raw === 'true';
    const needsTranscode = !SUPPORTED_NATIVE_MIMES.includes(mimeType) && media.type !== 'subtitle' && !fileNameIsSub(media.fileName);

    if (needsTranscode && !isRaw) {
      console.log(`🎬 On-the-fly Transcoding required for format: ${mimeType}`);
      
      const serverPort = process.env.PORT || 8000;
      // Loopback URL. This allows ffmpeg to execute HTTP 206 Range requests to find the Moov atom instantly.
      const rawUrl = `http://127.0.0.1:${serverPort}${req.originalUrl}${req.originalUrl.includes('?') ? '&' : '?'}raw=true`;

      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Transfer-Encoding': 'chunked',
        'Access-Control-Allow-Origin': '*'
      });

      const command = ffmpeg(rawUrl)
        .outputOptions([
          '-preset ultrafast',
          '-movflags frag_keyframe+empty_moov',
          '-c:v libx264', // Convert HEVC explicitly so Chrome can stream it
          '-c:a aac',
        ])
        .toFormat('mp4')
        .on('error', (err) => {
          if (!err.message.includes('SIGKILL') && !err.message.includes('Output stream closed')) {
             console.error('FFmpeg Stream Error:', err.message);
          }
          if (!res.headersSent) res.status(500).end();
        });
        
      command.pipe(res, { end: true });

      req.on('close', () => {
         command.kill('SIGKILL');
      });

      return;
    }

    // ─── Parse Range Header ───────────────────────────
    const range = req.headers.range;

    if (!range) {
      // No range requested — send full file (200)
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
      });

      const iter = client.iterDownload({
        file: new Api.InputDocumentFileLocation({
          id: document.id,
          accessHash: document.accessHash,
          fileReference: document.fileReference,
          thumbSize: '',
        }),
        requestSize: 512 * 1024, // 512KB chunks
      });

      for await (const chunk of iter) {
        if (res.destroyed) return;
        if (!res.write(chunk)) {
          await new Promise(resolve => {
            res.once('drain', resolve);
            res.once('close', resolve);
            res.once('error', resolve);
          });
        }
      }
      if (!res.destroyed) return res.end();
    }

    // ─── Range Request → 206 Partial Content ──────────
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    
    if (start >= fileSize) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Content-Type': mimeType,
      });
      return res.end();
    }

    const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 5 * 1024 * 1024 - 1, fileSize - 1); 
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
    });

    let downloaded = 0;
    const requestSize = 512 * 1024; // 512KB per MTProto request
    
    // GramJS throws corrupted bytes if offset is not perfectly aligned to 512KB.
    const alignedStart = Math.floor(start / requestSize) * requestSize;
    const skipBytes = start - alignedStart;
    const totalBytesToFetch = end - alignedStart + 1;

    const iter = client.iterDownload({
      file: new Api.InputDocumentFileLocation({
        id: document.id,
        accessHash: document.accessHash,
        fileReference: document.fileReference,
        thumbSize: '',
      }),
      offset: bigInt(alignedStart),
      requestSize: requestSize,
      limit: totalBytesToFetch,
    });

    let isFirstChunk = true;
    for await (const chunk of iter) {
      if (res.destroyed) return;
      
      let data = chunk;
      if (isFirstChunk) {
        data = chunk.slice(skipBytes);
        isFirstChunk = false;
      }

      const remaining = chunkSize - downloaded;
      const toWrite = remaining < data.length ? data.slice(0, remaining) : data;

      if (!res.write(toWrite)) {
        await new Promise(resolve => {
          res.once('drain', resolve);
          res.once('close', resolve);
          res.once('error', resolve);
        });
      }

      downloaded += toWrite.length;
      if (downloaded >= chunkSize || res.destroyed) return;
    }

    if (!res.destroyed) res.end();

  } catch (err) {
    console.error('Streaming error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Streaming failed' });
    } else {
      res.end();
    }
  }
}

// ─── Helper: Subtitle Serving ───────────────────────
function fileNameIsSub(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return lower.endsWith('.srt') || lower.endsWith('.vtt');
}

async function serveSubtitle(client, document, fileName, res) {
  try {
    const iter = client.iterDownload({
      file: new Api.InputDocumentFileLocation({
        id: document.id,
        accessHash: document.accessHash,
        fileReference: document.fileReference,
        thumbSize: '',
      }),
      requestSize: 1024 * 1024, // 1MB chunks (Subtitles are small)
    });

    let buffer = Buffer.alloc(0);
    for await (const chunk of iter) {
      buffer = Buffer.concat([buffer, chunk]);
    }

    let textC = buffer.toString('utf8');

    // Basic SRT to VTT Conversion
    if (fileName && fileName.toLowerCase().endsWith('.srt')) {
      textC = textC.replace(/\r\n|\r/g, '\n');
      // Convert timestamps: 00:00:20,000 --> 00:00:20.000
      textC = textC.replace(/(\d{2}:\d{2}:\d{2}),(\d{2,3})/g, '$1.$2');
      textC = 'WEBVTT\n\n' + textC;
    } else if (fileName && fileName.toLowerCase().endsWith('.vtt')) {
      if (!textC.trim().startsWith('WEBVTT')) {
        textC = 'WEBVTT\n\n' + textC; // enforce webvtt header just in case
      }
    }

    const byteLength = Buffer.byteLength(textC);
    res.writeHead(200, {
      'Content-Type': 'text/vtt',
      'Content-Length': byteLength,
      'Cache-Control': 'public, max-age=86400', // Cache for 1 Day
      'Access-Control-Allow-Origin': '*'
    });
    res.end(textC);
  } catch (err) {
    console.error('Subtitle streaming error:', err.message);
    if (!res.headersSent) res.status(500).end();
  }
}
