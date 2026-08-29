import type { EventDefinition } from '../types/domain.js';

/**
 * Single source of truth for the event vocabulary.
 *
 * `modelLabel` is the AudioSet class string exactly as the AST model emits it.
 * `key` is that same string slugified, and is what every toggle, mode setting and
 * detection record is stored under. Because the key is *derived* from the model
 * label by the same rule on both sides (see `slugifyModelLabel` here and
 * `slugify_model_label` in model_service/main.py), a prediction can never fail to
 * line up with a toggle: model label -> slug -> eventKey is a total function.
 */
export interface CatalogEntry extends EventDefinition {
  modelLabel: string;
}

/** Lowercase, collapse every non-alphanumeric run to a single underscore, trim. */
export function slugifyModelLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

interface CatalogSeed {
  modelLabel: string;
  label: string;
  category: EventDefinition['category'];
  icon: string;
  defaultAttention: EventDefinition['defaultAttention'];
}

/**
 * The 17 AudioSet classes X listens for. `modelLabel` strings must match
 * `model.config.id2label` byte for byte — model_service asserts this on boot.
 */
const SEED: CatalogSeed[] = [
  { modelLabel: 'Baby cry, infant cry', label: 'Baby Crying', category: 'home', icon: 'baby', defaultAttention: 'high' },
  { modelLabel: 'Doorbell', label: 'Doorbell', category: 'home', icon: 'doorbell', defaultAttention: 'medium' },
  { modelLabel: 'Knock', label: 'Knock', category: 'home', icon: 'knock', defaultAttention: 'medium' },
  { modelLabel: 'Bark', label: 'Dog Barking', category: 'environment', icon: 'dog', defaultAttention: 'low' },
  { modelLabel: 'Thunder', label: 'Thunder', category: 'environment', icon: 'thunder', defaultAttention: 'medium' },
  { modelLabel: 'Rain', label: 'Rain', category: 'environment', icon: 'rain', defaultAttention: 'low' },
  { modelLabel: 'Fire alarm', label: 'Fire Alarm', category: 'emergency', icon: 'fire', defaultAttention: 'critical' },
  { modelLabel: 'Siren', label: 'Siren', category: 'emergency', icon: 'siren', defaultAttention: 'critical' },
  // AudioSet has no "Emergency alarm" class; "Alarm" is the generic siren/klaxon
  // class, surfaced to the user as "Emergency Alarm". Key is therefore `alarm`.
  { modelLabel: 'Alarm', label: 'Emergency Alarm', category: 'emergency', icon: 'alarm', defaultAttention: 'critical' },
  { modelLabel: 'Glass', label: 'Glass', category: 'emergency', icon: 'glass', defaultAttention: 'critical' },
  { modelLabel: 'Breaking', label: 'Breaking', category: 'emergency', icon: 'glass', defaultAttention: 'critical' },
  { modelLabel: 'Vehicle', label: 'Vehicle', category: 'transport', icon: 'vehicle', defaultAttention: 'high' },
  { modelLabel: 'Vehicle horn, car horn, honking', label: 'Car Horn', category: 'transport', icon: 'horn', defaultAttention: 'high' },
  { modelLabel: 'Motorcycle', label: 'Motorcycle', category: 'transport', icon: 'motorcycle', defaultAttention: 'high' },
  { modelLabel: 'Train', label: 'Train', category: 'transport', icon: 'train', defaultAttention: 'high' },
  { modelLabel: 'Bicycle bell', label: 'Bicycle Bell', category: 'transport', icon: 'bike', defaultAttention: 'medium' },
  { modelLabel: 'Speech', label: 'Speech', category: 'speech', icon: 'speech', defaultAttention: 'medium' },
];

export const EVENT_CATALOG: CatalogEntry[] = SEED.map((entry) => ({
  key: slugifyModelLabel(entry.modelLabel),
  modelLabel: entry.modelLabel,
  label: entry.label,
  category: entry.category,
  icon: entry.icon,
  defaultAttention: entry.defaultAttention,
}));

const BY_KEY = new Map(EVENT_CATALOG.map((entry) => [entry.key, entry]));
const BY_MODEL_LABEL = new Map(EVENT_CATALOG.map((entry) => [entry.modelLabel, entry]));

export const EVENT_KEYS = EVENT_CATALOG.map((entry) => entry.key);

export function getEventDefinition(key: string): CatalogEntry | undefined {
  return BY_KEY.get(key);
}

/**
 * Resolve whatever the model service reported back to a catalog entry.
 *
 * Prefers the raw model label, then the already-slugified key, then a slugify of
 * the label. Any of the three is enough, so a partial/legacy payload still lands
 * on the right toggle instead of silently dropping the detection.
 */
export function resolveEvent(input: { eventKey?: string; modelLabel?: string; label?: string }): CatalogEntry | undefined {
  if (input.modelLabel && BY_MODEL_LABEL.has(input.modelLabel)) return BY_MODEL_LABEL.get(input.modelLabel);
  if (input.eventKey && BY_KEY.has(input.eventKey)) return BY_KEY.get(input.eventKey);
  if (input.label && BY_MODEL_LABEL.has(input.label)) return BY_MODEL_LABEL.get(input.label);
  for (const candidate of [input.eventKey, input.modelLabel, input.label]) {
    if (!candidate) continue;
    const entry = BY_KEY.get(slugifyModelLabel(candidate));
    if (entry) return entry;
  }
  return undefined;
}
