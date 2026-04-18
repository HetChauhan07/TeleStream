import { Router } from 'express';
import Media from '../models/Media.js';
import WatchProgress from '../models/WatchProgress.js';

const router = Router();

/**
 * GET /api/library
 * List movies and distinct TV shows. Supports search (?q=) and genre filter (?genre=).
 */
router.get('/', async (req, res) => {
  try {
    const { q, genre, sort = 'addedAt', order = 'desc', limit = 100, skip = 0 } = req.query;

    let matchQuery = {};

    // Text search (regex for partial/prefix matching)
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      matchQuery.title = { $regex: escaped, $options: 'i' };
    }

    // Genre filter
    if (genre) {
      matchQuery.genres = genre;
    }

    // Sort config
    const sortObj = {};
    if (sort) {
      sortObj[sort] = order === 'asc' ? 1 : -1;
    } else {
      sortObj['addedAt'] = -1;
    }

    // Grouping: Group TV episodes into a single entry. 
    // Also group multi-part movies (partNumber > 0) into a single entry. 
    // Keep standalone movies independent.
    const movies = await Media.aggregate([
      { $match: matchQuery },
      { $sort: sortObj },
      { 
        $group: {
          _id: { 
            $cond: [
              { $eq: ["$type", "tv"] }, 
              { $ifNull: ["$tmdbId", "$title"] }, 
              { $cond: [
                { $gt: ["$partNumber", 0] },
                { $ifNull: ["$tmdbId", "$title"] },
                "$_id"
              ]}
            ] 
          },
          doc: { $first: "$$ROOT" }
        }
      },
      { $replaceRoot: { newRoot: "$doc" } },
      { $sort: sortObj }, // Re-apply sorting after group un-ordering
      { $skip: parseInt(skip) },
      { $limit: parseInt(limit) }
    ]);

    // Attach watch progress to each item
    const mediaIds = movies.map((m) => m._id);
    const progress = await WatchProgress.find({ mediaId: { $in: mediaIds } }).lean();
    const progressMap = {};
    progress.forEach((p) => {
      progressMap[p.mediaId.toString()] = p;
    });

    const enriched = movies.map((m) => ({
      ...m,
      watchProgress: progressMap[m._id.toString()] || null,
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Library route error:', err.message);
    res.status(500).json({ error: 'Failed to fetch library' });
  }
});

/**
 * GET /api/library/genres
 * Returns a list of all unique genres.
 */
router.get('/genres', async (req, res) => {
  try {
    const genres = await Media.distinct('genres');
    res.json(genres.filter(Boolean).sort());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch genres' });
  }
});

/**
 * GET /api/library/:id
 * Get single media detail. If it is a TV show, fetch all related episodes. 
 * If it is a multi-part movie, fetch all related parts.
 */
router.get('/:id', async (req, res) => {
  try {
    const media = await Media.findById(req.params.id).lean();
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Attach watch progress for the main item
    const mainProgress = await WatchProgress.findOne({ mediaId: media._id }).lean();
    media.watchProgress = mainProgress || null;

    // Fetch all related subtitles for this media title/tmdbId
    const subtitleQuery = media.tmdbId ? { tmdbId: media.tmdbId, type: 'subtitle' } : { title: media.title, type: 'subtitle' };
    const allSubtitles = await Media.find(subtitleQuery).lean();

    // Attach standalone movie subtitles
    if (media.type === 'movie' && !media.partNumber) {
      media.subtitles = allSubtitles.filter(s => !s.seasonNumber && !s.partNumber);
    }

    // If it's a TV show, fetch all episodes
    if (media.type === 'tv') {
      const episodeQuery = media.tmdbId ? { tmdbId: media.tmdbId, type: 'tv' } : { title: media.title, type: 'tv' };
      const episodesList = await Media.find(episodeQuery)
        .sort({ seasonNumber: 1, episodeNumber: 1 })
        .lean();

      // Attach watch progress to episodes
      const epIds = episodesList.map((e) => e._id);
      const epProgress = await WatchProgress.find({ mediaId: { $in: epIds } }).lean();
      const epProgressMap = {};
      epProgress.forEach((p) => {
        epProgressMap[p.mediaId.toString()] = p;
      });

      media.episodes = episodesList.map((ep) => ({
        ...ep,
        watchProgress: epProgressMap[ep._id.toString()] || null,
        subtitles: allSubtitles.filter(s => s.seasonNumber === ep.seasonNumber && s.episodeNumber === ep.episodeNumber),
      }));
    } else if (media.partNumber > 0) {
      // If it's a multi-part movie, fetch all parts
      const partQuery = media.tmdbId ? { tmdbId: media.tmdbId, type: 'movie' } : { title: media.title, type: 'movie' };
      const partsList = await Media.find({ ...partQuery, partNumber: { $gt: 0 } })
        .sort({ partNumber: 1 })
        .lean();

      // Attach watch progress to parts
      const partIds = partsList.map((p) => p._id);
      const partProgress = await WatchProgress.find({ mediaId: { $in: partIds } }).lean();
      const partProgressMap = {};
      partProgress.forEach((p) => {
        partProgressMap[p.mediaId.toString()] = p;
      });

      media.parts = partsList.map((p) => ({
        ...p,
        watchProgress: partProgressMap[p._id.toString()] || null,
        subtitles: allSubtitles.filter(s => s.partNumber === p.partNumber),
      }));
    }

    res.json(media);
  } catch (err) {
    console.error('Library detail error:', err.message);
    res.status(500).json({ error: 'Failed to fetch media details' });
  }
});

export default router;
