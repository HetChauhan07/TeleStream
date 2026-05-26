import { Router } from 'express';
import User from '../models/User.js';
import Media from '../models/Media.js';

const router = Router();

/**
 * GET /api/watchlist
 * Get the user's watchlist
 */
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('watchlist');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Filter out any nulls in case a media was deleted
    const watchlist = user.watchlist.filter(media => media !== null);
    
    res.json(watchlist);
  } catch (err) {
    console.error('Watchlist get error:', err.message);
    res.status(500).json({ error: 'Failed to fetch watchlist' });
  }
});

/**
 * POST /api/watchlist/:mediaId
 * Add an item to the watchlist
 */
router.post('/:mediaId', async (req, res) => {
  try {
    const mediaId = req.params.mediaId;
    
    // Ensure media exists
    const media = await Media.findById(mediaId);
    if (!media) return res.status(404).json({ error: 'Media not found' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.watchlist) user.watchlist = [];
    
    if (!user.watchlist.includes(mediaId)) {
      user.watchlist.push(mediaId);
      await user.save();
    }
    
    res.json({ message: 'Added to watchlist', watchlist: user.watchlist });
  } catch (err) {
    console.error('Watchlist add error:', err.message);
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

/**
 * DELETE /api/watchlist/:mediaId
 * Remove an item from the watchlist
 */
router.delete('/:mediaId', async (req, res) => {
  try {
    const mediaId = req.params.mediaId;
    
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.watchlist) user.watchlist = [];
    
    user.watchlist = user.watchlist.filter(id => id.toString() !== mediaId);
    await user.save();
    
    res.json({ message: 'Removed from watchlist', watchlist: user.watchlist });
  } catch (err) {
    console.error('Watchlist remove error:', err.message);
    res.status(500).json({ error: 'Failed to remove from watchlist' });
  }
});

export default router;
