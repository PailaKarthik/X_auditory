import mongoose, { Schema } from 'mongoose';
import type { AttentionLevel } from '../types/domain.js';

const EventSettingSchema = new Schema(
  {
    eventKey: { type: String, required: true },
    enabled: { type: Boolean, default: false },
    attention: { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'medium' as AttentionLevel },
    xLight: { type: Boolean, default: true },
    vibration: { type: Boolean, default: true },
    phoneNotification: { type: Boolean, default: true },
    stt: { type: Boolean, default: false },
  },
  { _id: false },
);

const ModeSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    kind: { type: String, enum: ['predefined', 'custom'], required: true },
    description: { type: String, default: '' },
    eventSettings: { type: [EventSettingSchema], default: [] },
    active: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Every audio detection resolves the active mode first, so that lookup must be an
// index hit rather than a scan of the user's modes.
ModeSchema.index({ userId: 1, active: 1 });
ModeSchema.index({ userId: 1, slug: 1 }, { unique: true });

export const Mode = mongoose.model('Mode', ModeSchema);
