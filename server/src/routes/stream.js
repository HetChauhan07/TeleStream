import { Router } from 'express';
import jwt from 'jsonwebtoken';
import Media from '../models/Media.js';
import { streamMedia } from '../services/streamer.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'telestream-secret-key-change-me';

/**
 * GET /api/stream/:id
 * Streams video from Telegram with HTTP 206 Partial Content support.
 * Accepts token via query param (since <video> elements can't set headers)
 */
router.get('/:id', async (req, res) => {
  // Check token from query param (for video element) or header
  const token = req.query.token || (req.headers.authorization?.split(' ')[1]);

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const media = await Media.findById(req.params.id);
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    await streamMedia(media, req, res);
  } catch (err) {
    console.error('Stream route error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;
