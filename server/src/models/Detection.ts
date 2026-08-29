import mongoose, { Schema } from 'mongoose';

const DetectionSchema = new Schema(
  {
    userId: { type: String, required: true },
    /** Slug of `modelLabel`; always a key present in EVENT_CATALOG. */
    eventKey: { type: String, required: true },
    /** Raw AudioSet class the model reported, kept for traceability. */
    modelLabel: { type: String, default: '' },
    /** Human-facing display name from the catalog. */
    label: { type: String, required: true },
    direction: { type: String, default: 'unknown' },
    confidence: { type: Number, required: true },
    attention: { type: String, enum: ['critical', 'high', 'medium', 'low'], required: true },
    modeId: { type: Schema.Types.ObjectId, ref: 'Mode', required: true },
    modeName: { type: String, default: '' },
    source: { type: String, enum: ['x', 'simulation'], default: 'x' },
    /** Snapshot of the mode's delivery switches at detection time. */
    phoneNotification: { type: Boolean, default: true },
    xLight: { type: Boolean, default: true },
    vibration: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// The history and notification feeds both read "newest first for this user", so
// serve them from one compound index rather than a userId scan plus in-memory sort.
DetectionSchema.index({ userId: 1, createdAt: -1 });

export const Detection = mongoose.model('Detection', DetectionSchema);
