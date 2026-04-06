import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema({
  // ─── Telegram Reference ───────────────────────────
  telegramMessageId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  telegramChannelId: {
    type: String,
    required: true
  },

  // ─── File Metadata ────────────────────────────────
  fileName: { type: String, default: 'Unknown' },
  fileSize: { type: Number, default: 0 },
  mimeType: { type: String, default: 'video/mp4' },
  duration: { type: Number, default: 0 }, // seconds, from Telegram doc attributes

  // ─── TMDB Metadata ────────────────────────────────
  type: { type: String, enum: ['movie', 'tv', 'subtitle'], default: 'movie' },
  tmdbId: { type: Number, default: null },
  title: { type: String, required: true, index: true },
  originalTitle: { type: String, default: '' },
  overview: { type: String, default: '' },
  tagline: { type: String, default: '' },
  posterPath: { type: String, default: '' },
  backdropPath: { type: String, default: '' },
  genres: [{ type: String }],
  releaseDate: { type: String, default: '' },
  releaseYear: { type: Number, default: null },
  runtime: { type: Number, default: 0 }, // minutes
  voteAverage: { type: Number, default: 0 },
  cast: [{ type: String }],
  director: { type: String, default: '' },

  // ─── TV Series Metadata ───────────────────────────
  seasonNumber: { type: Number, default: null },
  episodeNumber: { type: Number, default: null },
  episodeTitle: { type: String, default: '' },
  episodeOverview: { type: String, default: '' },
  episodeStillPath: { type: String, default: '' },
  
  // ─── Multi-Part Movie Metadata ────────────────────
  partNumber: { type: Number, default: 0 },

  // ─── Internal ─────────────────────────────────────
  indexed: { type: Boolean, default: false },
  addedAt: { type: Date, default: Date.now }
});

// Text index for search
mediaSchema.index({ title: 'text', originalTitle: 'text', overview: 'text' });
mediaSchema.index({ type: 1, tmdbId: 1, seasonNumber: 1, episodeNumber: 1, partNumber: 1 }); // Useful for grouping episodes/parts

export default mongoose.model('Media', mediaSchema);
