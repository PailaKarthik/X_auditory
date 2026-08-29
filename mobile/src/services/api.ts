import type {
  Analytics,
  AudioDetectionResult,
  DetectionEvent,
  DeviceState,
  EventDefinition,
  Mode,
  SttEvent,
} from '@/src/types/domain';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';
const DEFAULT_TIMEOUT_MS = 12_000;
/** Audio inference is CPU-bound on the model service and legitimately slow. */
const AUDIO_TIMEOUT_MS = 60_000;

export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly payload?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Every call is time-boxed. Without this a single unreachable-server request hangs
 * forever and the screen that awaits it never settles.
 */
async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(rest.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(rest.headers ?? {}),
      },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(`Request timed out after ${timeoutMs / 1000}s (${path})`);
    }
    throw new ApiError(`Cannot reach the X server at ${BASE_URL}. Is it running?`);
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (payload as { message?: string })?.message ?? `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

export const api = {
  getModes() {
    return request<{ success: true; data: { modes: Mode[]; catalog: EventDefinition[] } }>('/modes');
  },
  getMode(id: string) {
    return request<{ success: true; data: Mode }>(`/modes/${id}`);
  },
  setActiveMode(modeId: string) {
    return request<{ success: true; data: Mode }>('/modes/active', {
      method: 'POST',
      body: JSON.stringify({ modeId }),
    });
  },
  patchEvent(modeId: string, eventKey: string, patch: Record<string, unknown>) {
    return request<{ success: true; data: Mode }>(`/modes/${modeId}/events/${eventKey}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  createCustomMode(body: {
    name: string;
    description?: string;
    events: Array<{ eventKey: string; enabled: boolean; attention: string }>;
  }) {
    return request<{ success: true; data: Mode }>('/modes/custom', { method: 'POST', body: JSON.stringify(body) });
  },
  renameMode(modeId: string, body: { name?: string; description?: string }) {
    return request<{ success: true; data: Mode }>(`/modes/${modeId}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  deleteMode(modeId: string) {
    return request<{ success: true; data: { deleted: string; activeMode: Mode | null } }>(`/modes/${modeId}`, {
      method: 'DELETE',
    });
  },
  /** `since` returns only detections newer than that ISO timestamp. */
  getDetections(since?: string) {
    const query = since ? `?since=${encodeURIComponent(since)}` : '';
    return request<{ success: true; data: DetectionEvent[] }>(`/detections${query}`);
  },
  getDetection(id: string) {
    return request<{ success: true; data: DetectionEvent }>(`/detections/${id}`);
  },
  simulateDetection(body: { eventKey: string; direction?: string; confidence?: number }) {
    return request<AudioDetectionResult>('/detections/simulate', { method: 'POST', body: JSON.stringify(body) });
  },
  getStt() {
    return request<{ success: true; data: SttEvent[] }>('/stt');
  },
  saveStt(body: { transcript: string; direction?: string; confidence?: number; mode?: string }) {
    return request<{ success: true; data: SttEvent }>('/stt', { method: 'POST', body: JSON.stringify(body) });
  },
  getDevice() {
    return request<{ success: true; data: DeviceState }>('/device');
  },
  getAnalytics() {
    return request<{ success: true; data: Analytics }>('/device/analytics');
  },
  health() {
    return request<{ success: true; data: Record<string, unknown> }>('/health', { timeoutMs: 5_000 });
  },
};

export async function sendAudio(file: Blob, filename = 'audio.wav', direction = 'unknown') {
  const form = new FormData();
  form.append('audio', file, filename);
  form.append('direction', direction);
  return request<AudioDetectionResult>('/detections/audio', {
    method: 'POST',
    body: form,
    timeoutMs: AUDIO_TIMEOUT_MS,
  });
}
