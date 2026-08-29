import { Router } from 'express';
import { Device } from '../models/Device.js';
import { Detection } from '../models/Detection.js';
import { Mode } from '../models/Mode.js';

export const deviceRouter = Router();
const DEMO_USER_ID = process.env.DEMO_USER_ID ?? 'demo-user';

deviceRouter.get('/', async (_req, res, next) => {
  try {
    const device = await Device.findOne({ userId: DEMO_USER_ID }).lean();
    res.json({ success: true, data: device });
  } catch (error) { next(error); }
});

deviceRouter.patch('/', async (req, res, next) => {
  try {
    const allowed = ['connected', 'battery', 'charging', 'bluetooth', 'microphones', 'sensors', 'firmware'] as const;
    const $set: Record<string, unknown> = {};
    for (const key of allowed) if (req.body?.[key] !== undefined) $set[key] = req.body[key];
    const device = await Device.findOneAndUpdate({ userId: DEMO_USER_ID }, { $set }, { new: true, upsert: true }).lean();
    res.json({ success: true, data: device });
  } catch (error) { next(error); }
});

deviceRouter.get('/analytics', async (_req, res, next) => {
  try {
    // Aggregated server-side: the previous version streamed every detection to Node
    // just to count them, which is the single slowest call in the app against Atlas.
    const [result] = await Detection.aggregate<{
      totals: Array<{ total: number; critical: number }>;
      today: Array<{ count: number }>;
      byEvent: Array<{ _id: string; count: number }>;
      byMode: Array<{ _id: unknown; count: number }>;
    }>([
      { $match: { userId: DEMO_USER_ID } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                critical: { $sum: { $cond: [{ $eq: ['$attention', 'critical'] }, 1, 0] } },
              },
            },
          ],
          today: [
            { $match: { createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } } },
            { $count: 'count' },
          ],
          byEvent: [{ $group: { _id: '$label', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }],
          byMode: [{ $group: { _id: '$modeId', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }],
        },
      },
    ]);

    const totals = result?.totals?.[0] ?? { total: 0, critical: 0 };
    const byEvent = result?.byEvent ?? [];
    const byMode = result?.byMode ?? [];

    const modes = await Mode.find({ _id: { $in: byMode.map((entry) => entry._id) } })
      .select({ name: 1 })
      .lean();
    const modeNames = new Map(modes.map((mode) => [String(mode._id), mode.name]));

    res.json({
      success: true,
      data: {
        total: totals.total,
        today: result?.today?.[0]?.count ?? 0,
        critical: totals.critical,
        mostDetected: byEvent[0] ? { label: byEvent[0]._id, count: byEvent[0].count } : null,
        topEvents: byEvent.map((entry) => ({ label: entry._id, count: entry.count })),
        modeUsage: byMode.map((entry) => [modeNames.get(String(entry._id)) ?? 'Deleted profile', entry.count]),
      },
    });
  } catch (error) { next(error); }
});
