import mongoose from 'mongoose';

const mediaRequestSchema = new mongoose.Schema({
  tmdbId: { type: Number, required: true },
  title: { type: String, required: true },
  type: { type: String, enum: ['movie', 'tv'], required: true },
  posterPath: { type: String, default: '' },
  releaseYear: { type: Number },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'fulfilled'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('MediaRequest', mediaRequestSchema);
