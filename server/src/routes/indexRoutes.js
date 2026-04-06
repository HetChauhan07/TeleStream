import { Router } from 'express';
import { indexChannel } from '../services/indexer.js';

const router = Router();

let isIndexing = false;

/**
 * POST /api/index
 * Trigger a full channel re-index.
 */
router.post('/', async (req, res) => {
  if (isIndexing) {
    return res.status(409).json({ error: 'Indexing already in progress' });
  }

  isIndexing = true;

  try {
    const result = await indexChannel();
    res.json({
      message: 'Indexing complete',
      ...result,
    });
  } catch (err) {
    console.error('Indexing route error:', err.message);
    res.status(500).json({ error: 'Indexing failed' });
  } finally {
    isIndexing = false;
  }
});

/**
 * GET /api/index/status
 * Check if indexing is in progress.
 */
router.get('/status', (req, res) => {
  res.json({ indexing: isIndexing });
});

export default router;
