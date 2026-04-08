import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import { initTelegram } from './services/telegram.js';
import { indexChannel } from './services/indexer.js';
import User from './models/User.js';
import { requireAuth } from './middleware/auth.js';

// Routes
import streamRoutes from './routes/stream.js';
import libraryRoutes from './routes/library.js';
import progressRoutes from './routes/progress.js';
import indexRoutes from './routes/indexRoutes.js';
import authRoutes from './routes/auth.js';


const app = express();
const PORT = process.env.PORT || 8000;
let serverReady = false;

// ─── Middleware ──────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());

// ─── Readiness Gate ─────────────────────────────────
// Return 503 for all API routes (except health) until DB+Telegram are ready
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (!serverReady) {
    return res.status(503).json({ error: 'Server is starting up, please wait...' });
  }
  next();
});

// ─── Public Routes (no auth required) ───────────────
app.use('/api/auth', authRoutes);

// ─── Protected Routes (require login) ───────────────
app.use('/api/stream', streamRoutes); // handles its own auth (query param token for video elements)
app.use('/api/library', requireAuth, libraryRoutes);
app.use('/api/progress', requireAuth, progressRoutes);
app.use('/api/index', requireAuth, indexRoutes);


// Health check (public)
app.get('/api/health', async (req, res) => {
  let telegramStatus = 'unknown';
  if (serverReady) {
    try {
      const { getTelegramClient } = await import('./services/telegram.js');
      const client = getTelegramClient();
      await Promise.race([
        client.getMe(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 3000))
      ]);
      telegramStatus = 'connected';
    } catch (err) {
      telegramStatus = err.message === 'TIMEOUT' ? 'hanging' : 'error';
    }
  }
  res.json({ status: serverReady ? 'ready' : 'starting', uptime: process.uptime(), telegramStatus });
});

// ─── Seed Admin Account ─────────────────────────────
async function seedAdmin() {
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = await User.findOne({ username: adminUser });
  if (!existing) {
    await User.create({
      username: adminUser,
      password: adminPass,
      role: 'admin',
    });
    console.log(`👑 Admin account created: ${adminUser} / ${adminPass}`);
  } else {
    console.log(`👑 Admin account exists: ${adminUser}`);
  }
}

// ─── Startup ────────────────────────────────────────
async function start() {
  console.log(`
  ╔══════════════════════════════════════╗
  ║      ⚡ TeleStream Server ⚡        ║
  ║   Telegram-backed Media Streaming   ║
  ╚══════════════════════════════════════╝
  `);

  // 1. Start Express server FIRST so Render detects the port immediately
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🌐 Server running at http://0.0.0.0:${PORT}`);
    console.log(`   API docs:`);
    console.log(`   • POST /api/auth/login       — Login`);
    console.log(`   • POST /api/auth/register    — Create user (admin)`);
    console.log(`   • GET  /api/auth/users       — List users (admin)`);
    console.log(`   • GET  /api/library          — Browse movies`);
    console.log(`   • GET  /api/library/:id      — Movie detail`);
    console.log(`   • GET  /api/stream/:id       — Stream video`);
    console.log(`   • GET  /api/progress/:id     — Watch progress`);
    console.log(`   • PUT  /api/progress/:id     — Update progress`);
    console.log(`   • POST /api/index            — Re-index channel`);
    console.log(`   • GET  /api/health           — Health check`);
  });

  // 2. Now initialize services in the background
  try {
    await connectDB();
    await seedAdmin();

    // Mark server as ready as soon as DB is connected
    // Library can serve cached movies from MongoDB even without Telegram
    serverReady = true;
    console.log('✅ Database ready — server is accepting requests!');

    // Initialize Telegram separately (non-blocking for server readiness)
    try {
      await initTelegram();
      console.log('✅ Telegram connected!');

      // Auto-index on startup (non-blocking)
      console.log('\n🚀 Running initial index...');
      indexChannel().catch((err) => {
        console.error('Initial indexing failed:', err.message);
      });
    } catch (telegramErr) {
      console.error('⚠️ Telegram initialization failed:', telegramErr.message);
      console.error('   Library will serve cached data. Streaming/indexing will not work until Telegram reconnects.');
    }
  } catch (err) {
    console.error('⚠️ Database initialization error:', err.message);
    console.error('   Server is running but no data can be served.');
  }
}

start().catch((err) => {
  console.error('💥 Failed to start server:', err);
  process.exit(1);
});
