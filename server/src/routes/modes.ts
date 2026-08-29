import { Router } from 'express';
import { Mode } from '../models/Mode.js';
import { EVENT_CATALOG, getEventDefinition } from '../utils/catalog.js';
import type { AttentionLevel } from '../types/domain.js';

export const modesRouter = Router();
const DEMO_USER_ID = process.env.DEMO_USER_ID ?? 'demo-user';

const ATTENTION_LEVELS: AttentionLevel[] = ['critical', 'high', 'medium', 'low'];
const isAttention = (value: unknown): value is AttentionLevel =>
  typeof value === 'string' && (ATTENTION_LEVELS as string[]).includes(value);

/** Build a full settings array so every mode carries a toggle for every catalog event. */
function buildEventSettings(
  overrides: Map<string, { enabled?: boolean; attention?: AttentionLevel }>,
) {
  return EVENT_CATALOG.map((event) => {
    const override = overrides.get(event.key);
    return {
      eventKey: event.key,
      enabled: override?.enabled ?? false,
      attention: override?.attention ?? event.defaultAttention,
      xLight: true,
      vibration: true,
      phoneNotification: true,
      stt: event.category === 'speech',
    };
  });
}

async function uniqueSlug(base: string) {
  const root = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'profile';
  let slug = root;
  let suffix = 2;
  // The (userId, slug) index is unique, so resolve collisions before inserting.
  while (await Mode.exists({ userId: DEMO_USER_ID, slug })) {
    slug = `${root}-${suffix++}`;
  }
  return slug;
}

modesRouter.get('/', async (_req, res, next) => {
  try {
    const modes = await Mode.find({ userId: DEMO_USER_ID }).sort({ kind: 1, name: 1 }).lean();
    res.json({ success: true, data: { modes, catalog: EVENT_CATALOG } });
  } catch (error) { next(error); }
});

/** The catalog alone, so clients can render toggles without pulling every mode. */
modesRouter.get('/catalog', (_req, res) => res.json({ success: true, data: EVENT_CATALOG }));

modesRouter.get('/:id', async (req, res, next) => {
  try {
    const mode = await Mode.findOne({ _id: req.params.id, userId: DEMO_USER_ID }).lean();
    if (!mode) return res.status(404).json({ success: false, message: 'Mode not found' });
    res.json({ success: true, data: mode });
  } catch (error) { next(error); }
});

modesRouter.patch('/:id/events/:eventKey', async (req, res, next) => {
  try {
    const { enabled, attention, xLight, vibration, phoneNotification, stt } = req.body as Partial<{
      enabled: boolean;
      attention: AttentionLevel;
      xLight: boolean;
      vibration: boolean;
      phoneNotification: boolean;
      stt: boolean;
    }>;

    if (attention !== undefined && !isAttention(attention)) {
      return res.status(400).json({ success: false, message: `attention must be one of ${ATTENTION_LEVELS.join(', ')}` });
    }
    if (!getEventDefinition(req.params.eventKey)) {
      return res.status(404).json({ success: false, message: `Unknown event "${req.params.eventKey}"` });
    }

    const mode = await Mode.findOne({ _id: req.params.id, userId: DEMO_USER_ID });
    if (!mode) return res.status(404).json({ success: false, message: 'Mode not found' });

    let setting = mode.eventSettings.find((item) => item.eventKey === req.params.eventKey);
    if (!setting) {
      // Catalog gained an event after this mode was created; add it rather than 404.
      const definition = getEventDefinition(req.params.eventKey)!;
      mode.eventSettings.push({
        eventKey: definition.key,
        enabled: false,
        attention: definition.defaultAttention,
        xLight: true,
        vibration: true,
        phoneNotification: true,
        stt: definition.category === 'speech',
      });
      setting = mode.eventSettings[mode.eventSettings.length - 1];
    }

    if (enabled !== undefined) setting.enabled = enabled;
    if (attention !== undefined) setting.attention = attention;
    if (xLight !== undefined) setting.xLight = xLight;
    if (vibration !== undefined) setting.vibration = vibration;
    if (phoneNotification !== undefined) setting.phoneNotification = phoneNotification;
    if (stt !== undefined) setting.stt = stt;

    await mode.save();
    res.json({ success: true, data: mode });
  } catch (error) { next(error); }
});

modesRouter.post('/active', async (req, res, next) => {
  try {
    const { modeId } = req.body as { modeId?: string };
    if (!modeId) return res.status(400).json({ success: false, message: 'modeId is required' });

    const target = await Mode.findOne({ _id: modeId, userId: DEMO_USER_ID });
    if (!target) return res.status(404).json({ success: false, message: 'Mode not found' });

    // Clear first, then set, so exactly one mode is ever active.
    await Mode.updateMany({ userId: DEMO_USER_ID, _id: { $ne: target._id } }, { $set: { active: false } });
    target.active = true;
    await target.save();

    console.log(`[modes] active mode -> ${target.name} (${target.eventSettings.filter((s) => s.enabled).length} events on)`);
    res.json({ success: true, data: target });
  } catch (error) { next(error); }
});

modesRouter.post('/custom', async (req, res, next) => {
  try {
    const { name, description, events } = req.body as {
      name?: string;
      description?: string;
      events?: Array<{ eventKey: string; enabled?: boolean; attention?: AttentionLevel }>;
    };

    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Mode name is required' });

    const unknown = (events ?? []).map((e) => e.eventKey).filter((key) => !getEventDefinition(key));
    if (unknown.length) {
      return res.status(400).json({ success: false, message: `Unknown event keys: ${unknown.join(', ')}` });
    }

    const overrides = new Map((events ?? []).map((item) => [item.eventKey, item]));
    const mode = await Mode.create({
      userId: DEMO_USER_ID,
      name: name.trim(),
      slug: await uniqueSlug(name.trim()),
      kind: 'custom',
      description: description?.trim() || 'User-created profile',
      eventSettings: buildEventSettings(overrides),
      active: false,
    });

    res.status(201).json({ success: true, data: mode });
  } catch (error) { next(error); }
});

/** Rename or re-describe a custom profile. */
modesRouter.patch('/:id', async (req, res, next) => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    const mode = await Mode.findOne({ _id: req.params.id, userId: DEMO_USER_ID });
    if (!mode) return res.status(404).json({ success: false, message: 'Mode not found' });
    if (mode.kind !== 'custom') {
      return res.status(403).json({ success: false, message: 'Built-in modes cannot be renamed' });
    }
    if (name?.trim()) {
      mode.name = name.trim();
      mode.slug = await uniqueSlug(name.trim());
    }
    if (description !== undefined) mode.description = description.trim();
    await mode.save();
    res.json({ success: true, data: mode });
  } catch (error) { next(error); }
});

modesRouter.delete('/:id', async (req, res, next) => {
  try {
    const mode = await Mode.findOne({ _id: req.params.id, userId: DEMO_USER_ID });
    if (!mode) return res.status(404).json({ success: false, message: 'Mode not found' });
    if (mode.kind !== 'custom') {
      return res.status(403).json({ success: false, message: 'Built-in modes cannot be deleted' });
    }

    const wasActive = mode.active;
    await mode.deleteOne();

    // Never leave the user with no active mode: fall back to Home.
    let fallback = null;
    if (wasActive) {
      fallback = await Mode.findOneAndUpdate(
        { userId: DEMO_USER_ID, slug: 'home' },
        { $set: { active: true } },
        { new: true },
      );
      if (!fallback) {
        fallback = await Mode.findOneAndUpdate(
          { userId: DEMO_USER_ID },
          { $set: { active: true } },
          { new: true },
        );
      }
    }

    res.json({ success: true, data: { deleted: String(mode._id), activeMode: fallback } });
  } catch (error) { next(error); }
});
