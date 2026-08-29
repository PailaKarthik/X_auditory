import mongoose, { Schema } from 'mongoose';

const SttEventSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    transcript: { type: String, required: true },
    direction: { type: String, default: 'unknown' },
    confidence: { type: Number, default: null },
    mode: { type: String, default: 'conversation' },
  },
  { timestamps: true },
);

export const SttEvent = mongoose.model('SttEvent', SttEventSchema);
