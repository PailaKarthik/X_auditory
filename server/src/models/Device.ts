import mongoose, { Schema } from 'mongoose';

const DeviceSchema = new Schema(
  {
    userId: { type: String, unique: true, index: true },
    name: { type: String, default: 'X' },
    connected: { type: Boolean, default: true },
    battery: { type: Number, default: 82 },
    charging: { type: Boolean, default: false },
    bluetooth: { type: String, default: 'Connected' },
    microphones: { type: String, default: 'Active' },
    sensors: { type: String, default: 'Active' },
    firmware: { type: String, default: 'Up to date' },
  },
  { timestamps: true },
);

export const Device = mongoose.model('Device', DeviceSchema);
