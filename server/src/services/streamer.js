import { Api } from 'telegram';
import { getTelegramClient } from './telegram.js';
import bigInt from 'big-integer';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { PassThrough } from 'stream';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const SUPPORTED_NATIVE_MIMES = ['video/mp4', 'video/webm', 'video/ogg', 'video/mp2t'];

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
  if (storedMime && storedMime.startsWith('video/')) return storedMime;
  if (fileName) {
    const ext = '.' + fileName.split('.').pop().toLowerCase();
    if (EXT_TO_MIME[ext]) return EXT_TO_MIME[ext];
  }
  return storedMime || 'video/mp4';
}

export async function streamMedia(media, req, res) {
  const client = getTelegramClient();
  const channelId = media.telegramChannelId;
  const messageId = media.telegramMessageId;

  try {
    let messages;
    try {
      messages = await Promise.race([
        client.getMessages(channelId, { ids: [messageId] }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
      ]);
    } catch (err) {
      if (err.message === 'TIMEOUT') {
        console.log('Telegram socket dropped! Reconnecting...');
        await client.connect();
        messages = await client.getMessages(channelId, { ids: [messageId] });
      } else {
        throw err;
      }
    }
    
    if (!messages || messages.length === 0 || !messages[0]) {
      return res.status(404).json({ error: 'Telegram message not found' });
    }

    const message = messages[0];
    if (!message.media || !message.media.document) {
      return res.status(404).json({ error: 'No video document in message' });
    }

    const document = message.media.document;
    const fileSize = Number(document.size);
    let mimeType = inferMimeType(media.fileName, media.mimeType || document.mimeType);

    if (media.type === 'subtitle' || fileNameIsSub(media.fileName)) {
      return await serveSubtitle(client, document, media.fileName, res);
    }

    const isRaw = req.query && req.query.raw === 'true';
    const quality = req.query.quality; 
    const startOffset = req.query.start; 
    const isDownload = req.query.download === 'true';

    let needsTranscode = !SUPPORTED_NATIVE_MIMES.includes(mimeType) && media.type !== 'subtitle' && !fileNameIsSub(media.fileName);
    if (quality && quality !== 'original' && media.type !== 'subtitle') needsTranscode = true;

    // ─── FFmpeg Transcode Pipeline ───
    if (needsTranscode && !isRaw) {
      console.log(`Transcode Pipeline: ${mimeType} | Quality: ${quality || 'original'} | Start: ${startOffset || 0}s`);
      
      const headers = {
        'Content-Type': 'video/mp4',
        'Transfer-Encoding': 'chunked',
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'no-cache',
      };
      if (isDownload) headers['Content-Disposition'] = `attachment; filename="${media.fileName || 'video.mp4'}"`;
      res.writeHead(200, headers);

      const inputStream = new PassThrough();
      const command = ffmpeg(inputStream);

      command.inputOptions(['-analyzeduration 1000000', '-probesize 1000000', '-fflags +nobuffer', '-flags +low_delay']);
      if (startOffset) command.inputOptions([`-ss ${startOffset}`]);

      const outputOptions = ['-preset ultrafast', '-tune zerolatency', '-movflags frag_keyframe+empty_moov', '-c:a aac', '-strict experimental', '-map 0:v:0', '-map 0:a:0?', '-ignore_unknown', '-f mp4', '-max_muxing_queue_size 1024', '-threads 0'];

      if (!quality || quality === 'original') outputOptions.push('-c:v copy');
      else {
        outputOptions.push('-c:v libx264', '-pix_fmt yuv420p', `-vf scale=-2:${quality}`, '-crf 28');
      }

      command.outputOptions(outputOptions)
        .toFormat('mp4')
        .on('error', (err) => {
          if (!err.message.includes('SIGKILL') && !err.message.includes('Output stream closed')) console.error('  Pipeline Error:', err.message);
          if (!res.headersSent) res.status(500).end();
          inputStream.destroy();
        })
        .pipe(res, { end: true });

      (async () => {
        try {
          const CHUNK_SIZE = 512 * 1024; 
          const PREFETCH_WINDOW = 4;      
          const fetchChunk = async (offset) => {
            if (offset >= fileSize) return null;
            const result = await client.invoke(
              new Api.upload.GetFile({
                location: new Api.InputDocumentFileLocation({ id: document.id, accessHash: document.accessHash, fileReference: document.fileReference, thumbSize: '' }),
                offset: bigInt(offset), limit: 512 * 1024, 
              })
            );
            return result.bytes;
          };

          let nextOffsetToQueue = 0;
          const activeRequests = new Map(); 

          while (nextOffsetToQueue < fileSize || activeRequests.size > 0) {
            if (res.destroyed || inputStream.destroyed) break;
            while (activeRequests.size < PREFETCH_WINDOW && nextOffsetToQueue < fileSize) {
              activeRequests.set(nextOffsetToQueue, fetchChunk(nextOffsetToQueue));
              nextOffsetToQueue += CHUNK_SIZE;
            }
            const oldestOffset = Math.min(...activeRequests.keys());
            const chunk = await activeRequests.get(oldestOffset);
            activeRequests.delete(oldestOffset);

            if (chunk) {
              if (!inputStream.write(chunk)) await new Promise(r => inputStream.once('drain', r));
            }
          }
          inputStream.end();
        } catch (err) {
          inputStream.destroy();
        }
      })();

      req.on('close', () => { command.kill('SIGKILL'); inputStream.destroy(); });
      return;
    }

    // ─── Native High-Speed Stream Pipeline ───
    const range = req.headers.range;
    const nativeHeaders = {
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Range',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    };

    if (isDownload) nativeHeaders['Content-Disposition'] = `attachment; filename="${media.fileName || 'video'}"`;

    if (!range) {
      nativeHeaders['Content-Length'] = fileSize;
      res.writeHead(200, nativeHeaders);
      const iter = client.iterDownload({
        file: new Api.InputDocumentFileLocation({ id: document.id, accessHash: document.accessHash, fileReference: document.fileReference, thumbSize: '' }),
        requestSize: 1024 * 1024,
      });
      for await (const chunk of iter) {
        if (res.destroyed) return;
        if (!res.write(chunk)) await new Promise(r => res.once('drain', r));
      }
      return res.end();
    }

    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    
    if (start >= fileSize) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}`, 'Content-Type': mimeType });
      return res.end();
    }

     
    const CHUNK_SIZE = 5 * 1024 * 1024;
    const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + CHUNK_SIZE - 1, fileSize - 1); 
    const chunkSize = end - start + 1;

    nativeHeaders['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
    nativeHeaders['Content-Length'] = chunkSize;
    res.writeHead(206, nativeHeaders);

    // THE FIX: Concurrent Prefetching Queue
    let downloaded = 0;
    const requestSize = 512 * 1024; // Telegram atomic block
    let currentTelegramOffset = Math.floor(start / requestSize) * requestSize;
    let skipBytes = start - currentTelegramOffset;

    // We will download 4 chunks (2MB) simultaneously to kill network latency
    const PREFETCH_CONCURRENCY = 4; 
    const activeFetches = []; 
    let fetchOffset = currentTelegramOffset;

    const fillQueue = () => {
      while (activeFetches.length < PREFETCH_CONCURRENCY && fetchOffset <= end) {
        const offsetForThisFetch = fetchOffset;
        const fetchPromise = client.invoke(
          new Api.upload.GetFile({
            location: new Api.InputDocumentFileLocation({
              id: document.id, accessHash: document.accessHash, fileReference: document.fileReference, thumbSize: ''
            }),
            offset: bigInt(offsetForThisFetch),
            limit: requestSize,
          })
        ).then(res => res.bytes).catch(err => {
           console.error(`  Fetch Error at offset ${offsetForThisFetch}:`, err.message);
           return null; 
        });

        activeFetches.push(fetchPromise);
        fetchOffset += requestSize;
      }
    };

    while (downloaded < chunkSize) {
      if (res.destroyed) break;

      fillQueue(); // Keep background downloads active

      if (activeFetches.length === 0) break;

      // Pull the oldest chunk from the queue to maintain exact byte order
      const chunkData = await activeFetches.shift();

      if (!chunkData || chunkData.length === 0) {
        break; // EOF or Telegram rate limit hit
      }

      let dataToWrite = chunkData;

      if (skipBytes > 0) {
        dataToWrite = chunkData.slice(skipBytes);
        skipBytes = 0; 
      }

      const remainingToSend = chunkSize - downloaded;
      if (dataToWrite.length > remainingToSend) {
        dataToWrite = dataToWrite.slice(0, remainingToSend);
      }

      if (!res.write(dataToWrite)) {
        await new Promise(resolve => res.once('drain', resolve));
      }

      downloaded += dataToWrite.length;
    }

    if (!res.destroyed) res.end();

  } catch (err) {
    console.error('Streaming error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Streaming failed' });
    else res.end();
  }
}

// ─── Subtitle Serving ───
function fileNameIsSub(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return lower.endsWith('.srt') || lower.endsWith('.vtt');
}

async function serveSubtitle(client, document, fileName, res) {
  try {
    const iter = client.iterDownload({
      file: new Api.InputDocumentFileLocation({ id: document.id, accessHash: document.accessHash, fileReference: document.fileReference, thumbSize: '' }),
      requestSize: 1024 * 1024, 
    });

    let buffer = Buffer.alloc(0);
    for await (const chunk of iter) buffer = Buffer.concat([buffer, chunk]);
    
    let textC = buffer.toString('utf8');
    if (fileName && fileName.toLowerCase().endsWith('.srt')) {
      textC = textC.replace(/\r\n|\r/g, '\n').replace(/(\d{2}:\d{2}:\d{2}),(\d{2,3})/g, '$1.$2');
      textC = 'WEBVTT\n\n' + textC;
    } else if (fileName && fileName.toLowerCase().endsWith('.vtt')) {
      if (!textC.trim().startsWith('WEBVTT')) textC = 'WEBVTT\n\n' + textC; 
    }

    res.writeHead(200, {
      'Content-Type': 'text/vtt', 'Content-Length': Buffer.byteLength(textC),
      'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*'
    });
    res.end(textC);
  } catch (err) {
    if (!res.headersSent) res.status(500).end();
  }
}