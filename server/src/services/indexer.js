import { getTelegramClient } from './telegram.js';
import { searchMedia, getMediaDetails, getEpisodeDetails, parseFileName } from './tmdb.js';
import Media from '../models/Media.js';

const VIDEO_MIMES = [
  'video/mp4',
  'video/x-matroska',
  'video/webm',
  'video/avi',
  'video/x-msvideo',
  'video/quicktime',
  'video/x-flv',
  'video/mpeg',
];

const SUBTITLE_EXTS = ['.srt', '.vtt'];

// Map file extensions → proper MIME types (Telegram often returns empty or 'application/octet-stream' for documents)
const EXT_TO_MIME = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.ts': 'video/mp2t',
  '.m4v': 'video/mp4',
};

function inferMimeType(fileName, telegramMime) {
  // If Telegram provides a real video mime, trust it
  if (telegramMime && VIDEO_MIMES.includes(telegramMime)) {
    return telegramMime;
  }
  // Otherwise, infer from file extension
  if (fileName) {
    const ext = '.' + fileName.split('.').pop().toLowerCase();
    if (EXT_TO_MIME[ext]) {
      return EXT_TO_MIME[ext];
    }
  }
  // Last resort fallback
  return telegramMime || 'video/mp4';
}

/**
 * Scans the Telegram channel for video messages and indexes them.
 * Skips messages that are already in the database.
 */
export async function indexChannel() {
  const client = getTelegramClient();
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  if (!channelId) {
    console.error('❌ TELEGRAM_CHANNEL_ID not set in .env');
    return { added: 0, skipped: 0, errors: 0 };
  }

  console.log('🔍 Scanning Telegram channel for videos...');

  let added = 0;
  let skipped = 0;
  let errors = 0;
  const activeTelegramIds = new Set();
  const tmdbCache = new Map(); // Prevent mismatched movie parts due to API limits

  try {
    // Iterate through all messages in the channel
    for await (const message of client.iterMessages(channelId, {})) {
      try {
        // Skip non-media messages
        if (!message.media || !message.media.document) continue;

        activeTelegramIds.add(message.id);

        const document = message.media.document;
        const mimeType = document.mimeType || '';

        // Extract filename from document attributes
        let fileName = '';
        let duration = 0;
        for (const attr of document.attributes || []) {
          if (attr.className === 'DocumentAttributeFilename') {
            fileName = attr.fileName;
          }
          if (attr.className === 'DocumentAttributeVideo') {
            duration = attr.duration || 0;
          }
        }

        // Use caption as filename fallback
        if (!fileName && message.message) {
          fileName = message.message.split('\n')[0].trim();
        }

        if (!fileName) {
          fileName = `Media_${message.id}`;
        }

        const isVideoExt = /\.(mp4|mkv|avi|webm|mov|flv|wmv|mpeg)$/i.test(fileName);
        const isVideo = VIDEO_MIMES.includes(mimeType) || isVideoExt;
        const isSubtitle = SUBTITLE_EXTS.some(ext => fileName.toLowerCase().endsWith(ext));

        // Skip non-supported files
        if (!isVideo && !isSubtitle) continue;

        // Check if already indexed
        let exists = await Media.findOne({ telegramMessageId: message.id });
        let isBroken = false;
        
        if (exists) {
          // Consider "broken" if it's a video but missing TMDB ID 
          if (!isSubtitle && !exists.tmdbId) {
            isBroken = true;
            console.log(`  🔧 Re-syncing incomplete metadata for: "${exists.title}"...`);
          } else {
            skipped++;
            continue;
          }
        }

        // Parse title, year, and TV meta from filename
        const parsed = parseFileName(fileName);
        let { type, title, year, seasonNumber, episodeNumber, partNumber } = parsed;
        
        let initialMime = isSubtitle ? mimeType : inferMimeType(fileName, mimeType);

        // ─── Deep Probe for Video Containers ───
        // Fallback for files that claim to be MP4 but are actually MPEG-TS
        if (!isSubtitle && initialMime === 'video/mp4') {
          try {
            const probeIter = client.iterDownload({
              file: new Api.InputDocumentFileLocation({
                id: document.id,
                accessHash: document.accessHash,
                fileReference: document.fileReference,
                thumbSize: '',
              }),
              offset: 0,
              requestSize: 512 * 1024,
              limit: 512 * 1024,
            });
            let probeChunk = null;
            for await (const chunk of probeIter) {
              probeChunk = chunk; break;
            }
            if (probeChunk && probeChunk.length >= 8) {
              if (probeChunk[0] === 0x47) {
                console.log(`  🔍 Deep probe: "${fileName}" is actually MPEG-TS (video/mp2t)`);
                initialMime = 'video/mp2t';
              }
            }
          } catch (e) {
            console.warn('  ⚠️ Deep probe failed:', e.message);
          }
        }
        
        if (isSubtitle) {
          type = 'subtitle';
          console.log(`  📝 Found Subtitle: "${title}"${seasonNumber ? ` S${seasonNumber}E${episodeNumber}` : partNumber ? ` Pt${partNumber}` : ''}`);
        } else {
          if (type === 'tv') {
            console.log(`  📼 Found TV Episode: "${title}" S${seasonNumber}E${episodeNumber}`);
          } else if (partNumber && partNumber > 0) {
            console.log(`  📼 Found Movie Multi-part: "${title}" Part ${partNumber}`);
          } else {
            console.log(`  📼 Found Movie: "${title}" (${year || 'unknown year'})`);
          }
        }

        // Fetch TMDB metadata (only for videos)
        let metadata = {};
        let episodeMeta = {};
        
        if (!isSubtitle) {
          const cacheKey = `${type}-${title.toLowerCase()}-${year || ''}`;
          let searchResultId = null;
          
          if (tmdbCache.has(cacheKey)) {
            metadata = tmdbCache.get(cacheKey);
            searchResultId = metadata.tmdbId;
            console.log(`  ⚡ Using Cached TMDB Metadata for: "${title}"`);
          } else {
            const searchResult = await searchMedia(title, year, type);
            if (searchResult) {
              searchResultId = searchResult.id;
              const details = await getMediaDetails(searchResult.id, type);
              if (details) {
                metadata = details;
                tmdbCache.set(cacheKey, metadata);
              }
            }
          }
            
          if (type === 'tv' && seasonNumber && episodeNumber && searchResultId) {
            const epDetails = await getEpisodeDetails(searchResultId, seasonNumber, episodeNumber);
            if (epDetails) {
              episodeMeta = epDetails;
            }
          }
        }

        // Create database entry
        const mediaPayload = {
          telegramMessageId: message.id,
          telegramChannelId: channelId,
          fileName,
          fileSize: Number(document.size),
          mimeType: initialMime,
          duration,
          type,
          title: title,
          originalTitle: title,
          overview: metadata.overview || '',
          tagline: metadata.tagline || '',
          posterPath: metadata.posterPath || '',
          backdropPath: metadata.backdropPath || '',
          genres: metadata.genres || [],
          releaseDate: metadata.releaseDate || '',
          releaseYear: metadata.releaseYear || year,
          runtime: Math.round(duration / 60) || metadata.runtime || 0,
          voteAverage: metadata.voteAverage || 0,
          tmdbId: metadata.tmdbId || null,
          cast: metadata.cast || [],
          director: metadata.director || '',
          seasonNumber,
          episodeNumber,
          episodeTitle: episodeMeta.episodeTitle || '',
          episodeOverview: episodeMeta.episodeOverview || '',
          episodeStillPath: episodeMeta.episodeStillPath || '',
          partNumber,
          indexed: true,
        };

        if (isBroken) {
          await Media.updateOne({ _id: exists._id }, { $set: mediaPayload });
          console.log(`  ✅ Fixed: "${title}"${seasonNumber ? ` S${seasonNumber}E${episodeNumber}` : partNumber ? ` Pt${partNumber}` : ''}`);
        } else {
          await Media.create(mediaPayload);
          added++;
          console.log(`  ✅ Indexed: "${title}"${seasonNumber ? ` S${seasonNumber}E${episodeNumber}` : partNumber ? ` Pt${partNumber}` : ''}`);
        }

        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 500));

      } catch (msgErr) {
        console.error(`  ❌ Error processing message ${message.id}:`, msgErr.message);
        errors++;
      }
    }

    // ─── Two-Way Sync Cleanup ──────────
    const activeIdsArray = Array.from(activeTelegramIds);
    const deleteResult = await Media.deleteMany({
      telegramChannelId: channelId,
      telegramMessageId: { $nin: activeIdsArray }
    });
    
    if (deleteResult.deletedCount > 0) {
      console.log(`  🗑️ Removed ${deleteResult.deletedCount} deleted media entries from the database.`);
    }

  } catch (err) {
    console.error('❌ Channel scan failed:', err.message);
  }

  console.log(`\n📊 Indexing complete: ${added} added, ${skipped} skipped, ${errors} errors`);
  return { added, skipped, errors };
}
