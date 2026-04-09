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
    console.log('Fetching message from telegram for channel:', channelId, 'msgId:', messageId);
    
    // Render/PaaS often silently drops idle WebSockets. 
    // We add a 5-second timeout, and if it hangs, we force a reconnect.
    let messages;
    try {
      messages = await Promise.race([
        client.getMessages(channelId, { ids: [messageId] }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
      ]);
    } catch (err) {
      if (err.message === 'TIMEOUT') {
        console.log('⚠️ Telegram client socket silently dropped! Forcing reconnect...');
        await client.connect();
        messages = await client.getMessages(channelId, { ids: [messageId] });
      } else {
        throw err;
      }
    }
    
    console.log('Message fetched successfully');

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

    // ─── Query Parameters ───
    const isRaw = req.query && req.query.raw === 'true';
    const quality = req.query.quality; // e.g., '1080', '720', '480', 'original'
    const startOffset = req.query.start; // in seconds
    const isDownload = req.query.download === 'true';

    // ─── Native vs Transcode Detection ───
    let needsTranscode = !SUPPORTED_NATIVE_MIMES.includes(mimeType) && media.type !== 'subtitle' && !fileNameIsSub(media.fileName);
    
    // Force transcode if a specific quality is requested
    if (quality && quality !== 'original' && media.type !== 'subtitle') {
      needsTranscode = true;
    }

    if (needsTranscode && !isRaw) {
      console.log(`🎬 On-the-fly Transcoding: ${mimeType} | Quality: ${quality || 'original'} | Start: ${startOffset || 0}s`);
      
      const serverPort = process.env.PORT || 8000;
      // Stable internal URL using ID and Token
      const token = req.query.token || '';
      const rawUrl = `http://127.0.0.1:${serverPort}/api/stream/${media._id}?raw=true&token=${token}`;

      const headers = {
        'Content-Type': 'video/mp4',
        'Transfer-Encoding': 'chunked',
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'no-cache',
      };

      if (isDownload) {
        headers['Content-Disposition'] = `attachment; filename="${media.fileName || 'video.mp4'}"`;
      }

      res.writeHead(200, headers);

      const command = ffmpeg(rawUrl);

      // Add reconnection options for the input stream to handle transient network issues
      command.inputOptions([
        '-reconnect 1',
        '-reconnect_streamed 1',
        '-reconnect_at_eof 1',
        '-reconnect_delay_max 5',
        '-analyzeduration 5000000', // 5MB probe - safe balance for headers
        '-probesize 5000000',
      ]);

      // Add time offset logic
      if (startOffset) {
        command.inputOptions([`-ss ${startOffset}`]);
      }

      const outputOptions = [
        '-preset ultrafast',
        '-tune zerolatency',
        '-movflags frag_keyframe+empty_moov+default_base_moof',
        '-c:v libx264', // RE-ENCODE in 720p to ensure universal browser compatibility
        '-vf scale=-2:720', // LIMIT resolution to 720p to save Render CPU
        '-crf 28',         // Reduce quality slightly to speed up encoding
        '-c:a aac',
        '-strict experimental',
        '-map 0:v:0',
        '-map 0:a:0?',
        '-ignore_unknown',
        '-max_muxing_queue_size 1024',
        '-threads 0', 
      ];

      // Add scaler if quality is reduced
      if (quality && quality !== 'original') {
        outputOptions.push(`-vf scale=-2:${quality}`);
      }

      command.outputOptions(outputOptions)
        .toFormat('mp4')
        .outputOptions('-f mp4') // force format
        .on('start', (cmdLine) => {
          console.log('  FFmpeg started with command:', cmdLine);
        })
        .on('error', (err) => {
          if (!err.message.includes('SIGKILL') && !err.message.includes('Output stream closed')) {
             console.error('  ❌ FFmpeg Stream Error:', err.message);
          }
          if (!res.headersSent) res.status(500).end();
        })
        .on('end', () => {
          console.log('  🏁 FFmpeg transcoding finished.');
        });
        
      command.pipe(res, { end: true });

      req.on('close', () => {
         command.kill('SIGKILL');
      });

      return;
    }

    // ─── Parse Range Header ───────────────────────────
    const range = req.headers.range;

    const nativeHeaders = {
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Range',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    };

    if (isDownload) {
      nativeHeaders['Content-Disposition'] = `attachment; filename="${media.fileName || 'video'}"`;
    }

    if (!range) {
      // No range requested — send full file (200)
      nativeHeaders['Content-Length'] = fileSize;
      res.writeHead(200, nativeHeaders);

      const iter = client.iterDownload({
        file: new Api.InputDocumentFileLocation({
          id: document.id,
          accessHash: document.accessHash,
          fileReference: document.fileReference,
          thumbSize: '',
        }),
      requestSize: 1024 * 1024, // 1MB chunks
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

    // 2MB is the sweet spot for Render Free Tier memory (512MB)
    const CHUNK_SIZE = 2 * 1024 * 1024;
    const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + CHUNK_SIZE - 1, fileSize - 1); 
    const chunkSize = end - start + 1;

    nativeHeaders['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
    nativeHeaders['Content-Length'] = chunkSize;
    
    res.writeHead(206, nativeHeaders);

    if (isRaw) {
      console.log(`  📥 Loopback fetching: bytes ${start}-${end}/${fileSize}`);
    }

    let downloaded = 0;
    // Standard Telegram chunking
    const requestSize = 512 * 1024;
    
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
    const asyncIter = iter[Symbol.asyncIterator]();
    
    while (true) {
      if (res.destroyed) return;
      let chunkResult;
      try {
        chunkResult = await Promise.race([
          asyncIter.next(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('CHUNK_TIMEOUT')), 15000))
        ]);
      } catch (err) {
        if (err.message === 'CHUNK_TIMEOUT') {
           console.log('⚠️ Chunk download timed out! Closing stream to prompt client reconnect.');
           break;
        }
        throw err;
      }
      
      if (chunkResult.done) break;
      const chunk = chunkResult.value;
      
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
