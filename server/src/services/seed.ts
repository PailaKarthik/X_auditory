import { Mode } from '../models/Mode.js';
import { Device } from '../models/Device.js';
import { EVENT_CATALOG } from '../utils/catalog.js';
import type { AttentionLevel } from '../types/domain.js';

const DEMO_USER_ID = process.env.DEMO_USER_ID ?? 'demo-user';

type EventConfig = Record<string, { enabled: boolean; attention: AttentionLevel }>;

/**
 * Per-mode defaults, keyed by the catalog eventKey (the slugified model label).
 * Anything omitted defaults to disabled at the catalog's default attention.
 */
const configs: Record<string, EventConfig> = {
  environment: {
    thunder: { enabled: true, attention: 'medium' },
    rain: { enabled: true, attention: 'low' },
    bark: { enabled: true, attention: 'low' },
    baby_cry_infant_cry: { enabled: true, attention: 'high' },
    doorbell: { enabled: true, attention: 'medium' },
    vehicle_horn_car_horn_honking: { enabled: true, attention: 'high' },
  },
  travel: {
    vehicle: { enabled: true, attention: 'high' },
    motorcycle: { enabled: true, attention: 'high' },
    vehicle_horn_car_horn_honking: { enabled: true, attention: 'high' },
    siren: { enabled: true, attention: 'critical' },
    bicycle_bell: { enabled: true, attention: 'medium' },
    train: { enabled: true, attention: 'high' },
  },
  emergency: {
    fire_alarm: { enabled: true, attention: 'critical' },
    siren: { enabled: true, attention: 'critical' },
    alarm: { enabled: true, attention: 'critical' },
    glass: { enabled: true, attention: 'critical' },
    breaking: { enabled: true, attention: 'critical' },
  },
  home: {
    baby_cry_infant_cry: { enabled: true, attention: 'high' },
    doorbell: { enabled: true, attention: 'medium' },
    knock: { enabled: true, attention: 'medium' },
    fire_alarm: { enabled: true, attention: 'critical' },
    glass: { enabled: true, attention: 'critical' },
    breaking: { enabled: true, attention: 'critical' },
    bark: { enabled: false, attention: 'low' },
  },
  classroom: {
    speech: { enabled: true, attention: 'medium' },
    knock: { enabled: true, attention: 'medium' },
    fire_alarm: { enabled: true, attention: 'critical' },
    alarm: { enabled: true, attention: 'critical' },
  },
  public: {
    speech: { enabled: true, attention: 'medium' },
    train: { enabled: true, attention: 'high' },
    siren: { enabled: true, attention: 'critical' },
    alarm: { enabled: true, attention: 'critical' },
    vehicle: { enabled: true, attention: 'medium' },
  },
  // Conversation is a first-class mode: speech is the only thing it alerts on, so
  // ambient traffic and weather do not interrupt a live transcript.
  conversation: {
    speech: { enabled: true, attention: 'high' },
    fire_alarm: { enabled: true, attention: 'critical' },
    alarm: { enabled: true, attention: 'critical' },
    siren: { enabled: true, attention: 'critical' },
  },
};

const MODE_SEEDS: Array<{ name: string; slug: string; description: string }> = [
  { name: 'Environment', slug: 'environment', description: 'Understand surroundings' },
  { name: 'Travel', slug: 'travel', description: 'Traffic and mobility alerts' },
  { name: 'Emergency', slug: 'emergency', description: 'Critical safety events' },
  { name: 'Home', slug: 'home', description: 'Home sound alerts' },
  { name: 'Classroom / Meeting', slug: 'classroom', description: 'Speech and room alerts' },
  { name: 'Public', slug: 'public', description: 'Public announcements and events' },
  { name: 'Conversation', slug: 'conversation', description: 'Live speech-to-text with critical alerts' },
];

function settingsFor(slug: string) {
  const config = configs[slug] ?? {};
  return EVENT_CATALOG.map((event) => {
    const override = config[event.key];
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

/**
 * Idempotent. Creates any missing built-in mode and reconciles every existing mode
 * against the current catalog, so a vocabulary change never leaves stale eventKeys
 * that predictions can no longer match.
 */
export async function seedDemoData() {
  const catalogKeys = new Set(EVENT_CATALOG.map((event) => event.key));

  for (const seed of MODE_SEEDS) {
    const existing = await Mode.findOne({ userId: DEMO_USER_ID, slug: seed.slug });
    if (!existing) {
      await Mode.create({
        userId: DEMO_USER_ID,
        name: seed.name,
        slug: seed.slug,
        kind: 'predefined',
        description: seed.description,
        active: false,
        eventSettings: settingsFor(seed.slug),
      });
      console.log(`[seed] created mode "${seed.name}"`);
    }
  }

  // Reconcile every mode (built-in and custom) with the catalog.
  const modes = await Mode.find({ userId: DEMO_USER_ID });
  for (const mode of modes) {
    const present = new Set(mode.eventSettings.map((setting) => setting.eventKey));
    const stale = mode.eventSettings.filter((setting) => !catalogKeys.has(setting.eventKey));
    const missing = EVENT_CATALOG.filter((event) => !present.has(event.key));
    if (!stale.length && !missing.length) continue;

    if (stale.length) {
      mode.eventSettings = mode.eventSettings.filter((setting) => catalogKeys.has(setting.eventKey)) as typeof mode.eventSettings;
    }
    for (const event of missing) {
      const preset = configs[mode.slug]?.[event.key];
      mode.eventSettings.push({
        eventKey: event.key,
        enabled: preset?.enabled ?? false,
        attention: preset?.attention ?? event.defaultAttention,
        xLight: true,
        vibration: true,
        phoneNotification: true,
        stt: event.category === 'speech',
      });
    }
    await mode.save();
    console.log(
      `[seed] reconciled "${mode.name}": +${missing.length} new event(s), -${stale.length} stale event(s)`,
    );
  }

  // Exactly one mode must be active.
  const activeCount = await Mode.countDocuments({ userId: DEMO_USER_ID, active: true });
  if (activeCount === 0) {
    await Mode.findOneAndUpdate({ userId: DEMO_USER_ID, slug: 'home' }, { $set: { active: true } });
    console.log('[seed] no active mode, defaulted to Home');
  } else if (activeCount > 1) {
    const [keep, ...rest] = await Mode.find({ userId: DEMO_USER_ID, active: true }).select({ _id: 1 });
    await Mode.updateMany({ _id: { $in: rest.map((mode) => mode._id) } }, { $set: { active: false } });
    console.log(`[seed] ${activeCount} modes were active, kept ${String(keep._id)}`);
  }

  await Device.findOneAndUpdate(
    { userId: DEMO_USER_ID },
    { $setOnInsert: { userId: DEMO_USER_ID, name: 'X', connected: true, battery: 82, charging: false } },
    { upsert: true, new: true },
  );
}
