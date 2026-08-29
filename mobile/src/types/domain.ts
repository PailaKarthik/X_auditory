export type AttentionLevel = 'critical' | 'high' | 'medium' | 'low';

/**
 * Event keys are the slugified AudioSet label the model emits, so a prediction
 * always lands on the matching toggle. Source of truth: server/src/utils/catalog.ts.
 */
export type EventKey =
  | 'baby_cry_infant_cry'
  | 'doorbell'
  | 'knock'
  | 'bark'
  | 'thunder'
  | 'rain'
  | 'fire_alarm'
  | 'siren'
  | 'alarm'
  | 'glass'
  | 'breaking'
  | 'vehicle'
  | 'vehicle_horn_car_horn_honking'
  | 'motorcycle'
  | 'train'
  | 'bicycle_bell'
  | 'speech';

export type ModeKind = 'predefined' | 'custom';

export interface EventDefinition {
  key: EventKey | string;
  /** Raw AudioSet class name, e.g. "Baby cry, infant cry". */
  modelLabel: string;
  /** Display name, e.g. "Baby Crying". */
  label: string;
  category: 'environment' | 'transport' | 'emergency' | 'speech' | 'home';
  icon: string;
  defaultAttention: AttentionLevel;
}

export interface EventSetting {
  eventKey: string;
  enabled: boolean;
  attention: AttentionLevel;
  xLight: boolean;
  vibration: boolean;
  phoneNotification: boolean;
  stt: boolean;
}

export interface Mode {
  _id: string;
  userId: string;
  name: string;
  slug: string;
  kind: ModeKind;
  description: string;
  eventSettings: EventSetting[];
  active: boolean;
}

export interface DetectionEvent {
  _id?: string;
  id?: string;
  eventKey: string;
  modelLabel?: string;
  label: string;
  direction: string;
  confidence: number;
  attention: AttentionLevel;
  modeId?: string;
  mode?: string;
  modeName?: string;
  source?: string;
  /** Snapshot of the mode's phone-notification switch when this fired. */
  phoneNotification?: boolean;
  xLight?: boolean;
  vibration?: boolean;
  createdAt: string;
}

export interface SttEvent {
  _id?: string;
  transcript: string;
  direction: string;
  confidence?: number | null;
  mode: string;
  createdAt: string;
}

export interface DeviceState {
  name: string;
  connected: boolean;
  battery: number;
  charging: boolean;
  bluetooth: string;
  microphones: string;
  sensors: string;
  firmware: string;
}

export interface Analytics {
  total: number;
  today: number;
  critical: number;
  mostDetected: { label: string; count: number } | null;
  topEvents: Array<{ label: string; count: number }>;
  modeUsage: [string, number][];
}

/** A prediction candidate returned alongside a detection, for the trace view. */
export interface ModelCandidate {
  eventKey: string;
  modelLabel: string;
  confidence: number;
}

export interface AudioDetectionResult {
  success: boolean;
  stage?: string;
  reason?: string;
  message?: string;
  data?: Partial<DetectionEvent> & {
    event?: string;
    directionLabel?: string;
    notify?: boolean;
    candidates?: ModelCandidate[];
    xResponse?: { light: boolean; vibration: boolean; color: string; text: string; durationSeconds: number };
  };
  timings?: Record<string, number>;
  trace?: Array<{ stage: string; detail?: unknown }>;
}
