import fs from 'node:fs/promises';

const MODEL_SERVICE_URL = process.env.MODEL_SERVICE_URL ?? 'http://127.0.0.1:8020';
const MODEL_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS ?? 30_000);

export interface ModelCandidate {
  eventKey: string;
  modelLabel: string;
  confidence: number;
}

export interface ModelPrediction {
  /** Slug of `modelLabel`; null when the clip matched none of the watched classes. */
  eventKey: string | null;
  modelLabel: string | null;
  confidence: number;
  /** Watched classes ranked high to low. `candidates[0]` is the reported event. */
  candidates: ModelCandidate[];
  /** Unfiltered top-K, for diagnosing why a clip did not match. */
  topOverall: Array<{ modelLabel: string; confidence: number; watched: boolean }>;
  audioSeconds: number;
  timings: Record<string, number>;
}

/** Carries the failing stage so the API can report *where* a detection broke. */
export class ModelServiceError extends Error {
  constructor(
    message: string,
    readonly stage: 'read_file' | 'connect' | 'timeout' | 'model' | 'parse',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ModelServiceError';
  }
}

export async function predictAudio(filePath: string): Promise<ModelPrediction> {
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(filePath);
  } catch (error) {
    throw new ModelServiceError(`Could not read uploaded audio: ${(error as Error).message}`, 'read_file');
  }
  if (bytes.byteLength === 0) {
    throw new ModelServiceError('Uploaded audio file is empty', 'read_file');
  }

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), 'audio.wav');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${MODEL_SERVICE_URL}/predict`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ModelServiceError(
        `Model service did not respond within ${MODEL_TIMEOUT_MS}ms (${MODEL_SERVICE_URL})`,
        'timeout',
      );
    }
    throw new ModelServiceError(
      `Cannot reach model service at ${MODEL_SERVICE_URL}. Is it running? (${(error as Error).message})`,
      'connect',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ModelServiceError(`Model service returned ${response.status}: ${body}`, 'model', response.status);
  }

  try {
    return (await response.json()) as ModelPrediction;
  } catch (error) {
    throw new ModelServiceError(`Model service returned malformed JSON: ${(error as Error).message}`, 'parse');
  }
}

export async function modelServiceHealth(): Promise<{ reachable: boolean; detail: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(`${MODEL_SERVICE_URL}/health`, { signal: controller.signal });
    return { reachable: response.ok, detail: await response.json().catch(() => null) };
  } catch (error) {
    return { reachable: false, detail: (error as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
