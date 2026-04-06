import { Router } from 'express';
import WatchProgress from '../models/WatchProgress.js';
import Media from '../models/Media.js';

const router = Router();

/**
 * GET /api/progress/continue
 * Returns all "continue watching" items (started but not completed).
 */
router.get('/continue', async (req, res) => {
  try {
    const items = await WatchProgress.find({
      completed: false,
      currentTime: { $gt: 0 },
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();

    // Enrich with media data
    const mediaIds = items.map((i) => i.mediaId);
    const medias = await Media.find({ _id: { $in: mediaIds } }).lean();
    const mediaMap = {};
    medias.forEach((m) => {
      mediaMap[m._id.toString()] = m;
    });

    const enriched = items
      .map((item) => ({
        ...mediaMap[item.mediaId.toString()],
        watchProgress: item,
      }))
      .filter((item) => item._id); // Filter out orphaned progress entries

    res.json(enriched);
  } catch (err) {
    console.error('Continue watching error:', err.message);
    res.status(500).json({ error: 'Failed to fetch continue watching' });
  }
});

/**
 * GET /api/progress/:mediaId
 * Get watch progress for a specific media.
 */
router.get('/:mediaId', async (req, res) => {
  try {
    const progress = await WatchProgress.findOne({
      mediaId: req.params.mediaId,
    }).lean();

    res.json(progress || { currentTime: 0, duration: 0, percentage: 0, completed: false });
  } catch (err) {
    console.error('Progress get error:', err.message);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

/**
 * PUT /api/progress/:mediaId
 * Update watch progress. Body: { currentTime, duration }
 */
router.put('/:mediaId', async (req, res) => {
  try {
    const { currentTime, duration } = req.body;

    let progress = await WatchProgress.findOne({
      mediaId: req.params.mediaId,
    });

    if (progress) {
      progress.currentTime = currentTime;
      progress.duration = duration;
      await progress.save(); // triggers pre-save hook for percentage
    } else {
      progress = await WatchProgress.create({
        mediaId: req.params.mediaId,
        currentTime,
        duration,
      });
    }

    res.json(progress);
  } catch (err) {
    console.error('Progress update error:', err.message);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

export default router;
