import { Router } from 'express';
import MediaRequest from '../models/MediaRequest.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import axios from 'axios';

const router = Router();

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

function getApiKey() {
  const key = process.env.TMDB_API_KEY;
  if (!key || key === 'your_tmdb_api_key_here') return null;
  return key;
}

/**
 * GET /api/requests/search
 * Search TMDB to show a list of media to request.
 */
router.get('/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const apiKey = getApiKey();
  if (!apiKey) return res.status(500).json({ error: 'TMDB API key not configured on server' });

  try {
    const { data: movieData } = await axios.get(`${TMDB_BASE}/search/movie`, {
      params: { api_key: apiKey, query: q, include_adult: false },
    });
    const { data: tvData } = await axios.get(`${TMDB_BASE}/search/tv`, {
      params: { api_key: apiKey, query: q, include_adult: false },
    });

    let results = [];
    if (movieData.results) {
      results = results.concat(movieData.results.map(m => ({
        tmdbId: m.id,
        title: m.title,
        type: 'movie',
        posterPath: m.poster_path ? `${IMG_BASE}/w200${m.poster_path}` : null,
        releaseYear: m.release_date ? parseInt(m.release_date.split('-')[0]) : null,
        popularity: m.popularity
      })));
    }
    if (tvData.results) {
      results = results.concat(tvData.results.map(t => ({
        tmdbId: t.id,
        title: t.name,
        type: 'tv',
        posterPath: t.poster_path ? `${IMG_BASE}/w200${t.poster_path}` : null,
        releaseYear: t.first_air_date ? parseInt(t.first_air_date.split('-')[0]) : null,
        popularity: t.popularity
      })));
    }

    // Sort by popularity and take top 15
    results.sort((a, b) => b.popularity - a.popularity);
    res.json(results.slice(0, 15));
  } catch (err) {
    console.error('TMDB search error:', err.message);
    res.status(500).json({ error: 'Failed to search TMDB' });
  }
});

/**
 * POST /api/requests
 * Create a new media request
 */
router.post('/', requireAuth, async (req, res) => {
  const { tmdbId, title, type, posterPath, releaseYear } = req.body;
  if (!tmdbId || !title || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check if it already exists in requests
    const existing = await MediaRequest.findOne({ tmdbId, type });
    if (existing) {
      return res.status(409).json({ error: 'This media has already been requested' });
    }

    const request = new MediaRequest({
      tmdbId,
      title,
      type,
      posterPath,
      releaseYear,
      user: req.user.userId || req.user.id
    });
    
    await request.save();
    res.json(request);
  } catch (err) {
    console.error('Create request error:', err.message);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

/**
 * GET /api/requests
 * Admin sees all pending. User sees their own.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    let query = { status: 'pending' };
    if (req.user.role !== 'admin') {
      query.user = req.user.userId || req.user.id;
    }

    const requests = await MediaRequest.find(query)
      .populate('user', 'username')
      .sort({ createdAt: -1 });
      
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

/**
 * DELETE /api/requests/:id
 * Admin can manually delete/reject a request
 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await MediaRequest.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete request' });
  }
});

export default router;
