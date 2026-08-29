import { Router } from 'express';
import { SttEvent } from '../models/SttEvent.js';

export const sttRouter = Router();
const DEMO_USER_ID = process.env.DEMO_USER_ID ?? 'demo-user';

sttRouter.get('/', async (_req, res, next) => {
  try {
    const records = await SttEvent.find({ userId: DEMO_USER_ID }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, data: records });
  } catch (error) { next(error); }
});

sttRouter.post('/', async (req, res, next) => {
  try {
    const { transcript, direction, confidence, mode } = req.body as Partial<{ transcript: string; direction: string; confidence: number; mode: string }>;
    if (!transcript?.trim()) return res.status(400).json({ success: false, message: 'transcript is required' });
    const saved = await SttEvent.create({ userId: DEMO_USER_ID, transcript: transcript.trim(), direction: direction ?? 'unknown', confidence: confidence ?? null, mode: mode ?? 'conversation' });
    res.status(201).json({ success: true, data: saved });
  } catch (error) { next(error); }
});
