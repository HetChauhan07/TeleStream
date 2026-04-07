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

// ─── Middleware ──────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());

// ─── Public Routes (no auth required) ───────────────
app.use('/api/auth', authRoutes);

// ─── Protected Routes (require login) ───────────────
app.use('/api/stream', streamRoutes); // handles its own auth (query param token for video elements)
app.use('/api/library', requireAuth, libraryRoutes);
app.use('/api/progress', requireAuth, progressRoutes);
app.use('/api/index', requireAuth, indexRoutes);


// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
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

  // 1. Connect to MongoDB
  await connectDB();

  // 2. Seed admin
  await seedAdmin();

  // 3. Initialize Telegram client
  await initTelegram();

  // 4. Auto-index on startup (non-blocking)
  console.log('\n🚀 Running initial index...');
  indexChannel().catch((err) => {
    console.error('Initial indexing failed:', err.message);
  });

  // 5. Start Express server
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
}

start().catch((err) => {
  console.error('💥 Failed to start server:', err);
  process.exit(1);
});
