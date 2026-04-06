import mongoose from 'mongoose';

const watchProgressSchema = new mongoose.Schema({
  mediaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media',
    required: true,
    index: true,
    unique: true
  },
  currentTime: { type: Number, default: 0 },     // seconds
  duration: { type: Number, default: 0 },          // seconds
  percentage: { type: Number, default: 0 },        // 0–100
  completed: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
});

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
