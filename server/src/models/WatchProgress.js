import mongoose from 'mongoose';

const watchProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  mediaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media',
    required: true,
    index: true
  },
  currentTime: { type: Number, default: 0 },     // seconds
  duration: { type: Number, default: 0 },          // seconds
  percentage: { type: Number, default: 0 },        // 0–100
  completed: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
});

// Ensure a user only has one progress record per media
watchProgressSchema.index({ userId: 1, mediaId: 1 }, { unique: true });

// Auto-update percentage and updatedAt on save
watchProgressSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  if (this.duration > 0) {
    this.percentage = Math.round((this.currentTime / this.duration) * 100);
  }
  if (this.percentage >= 95) {
    this.completed = true;
  }
  next();
});

export default mongoose.model('WatchProgress', watchProgressSchema);
