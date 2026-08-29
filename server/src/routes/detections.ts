import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { Detection } from '../models/Detection.js';
import { Mode } from '../models/Mode.js';
import { EVENT_CATALOG, resolveEvent } from '../utils/catalog.js';
import { ModelServiceError, predictAudio } from '../services/modelClient.js';
import { DIRECTIONS, isDirection } from '../types/domain.js';

export const detectionsRouter = Router();
const upload = multer({
  dest: path.join(os.tmpdir(), 'x-audio'),
  limits: { fileSize: Number(process.env.MAX_AUDIO_BYTES ?? 25 * 1024 * 1024) },
});
const DEMO_USER_ID = process.env.DEMO_USER_ID ?? 'demo-user';
/**
 * Below this the detection is reported (with reason `low_confidence` and the full
 * candidate list) but not persisted or notified. Set MIN_CONFIDENCE=0 to disable.
 * AST scores real recordings 0.3-0.9 on the dominant class; synthetic tones score
 * far lower, so keep this low enough not to swallow genuine quiet events.
 */
const MIN_CONFIDENCE = Number(process.env.MIN_CONFIDENCE ?? 0.05);

function directionLabel(direction: string) {
  return direction === 'unknown' ? 'Unknown direction' : `${direction.replace('_o_clock', '')} o'clock`;
}

const now = () => Number(process.hrtime.bigint() / 1_000_000n);

detectionsRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 200);
    const query: Record<string, unknown> = { userId: DEMO_USER_ID };
    // `since` lets the app poll for new detections without re-downloading history.
    if (typeof req.query.since === 'string' && req.query.since) {
      const since = new Date(req.query.since);
      if (!Number.isNaN(since.getTime())) query.createdAt = { $gt: since };
    }
    const events = await Detection.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ success: true, data: events });
  } catch (error) { next(error); }
});

detectionsRouter.get('/:id', async (req, res, next) => {
  try {
    const event = await Detection.findOne({ _id: req.params.id, userId: DEMO_USER_ID }).lean();
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, data: event });
  } catch (error) { next(error); }
});

/**
 * Audio -> event pipeline.
 *
 * Each stage is timed and named, and every early exit reports which stage decided
 * the outcome plus a `reason` code, so a clip that produces no alert can be
 * diagnosed from the response alone.
 */
detectionsRouter.post('/audio', upload.single('audio'), async (req, res, next) => {
  const startedAt = now();
  const timings: Record<string, number> = {};
  const trace: Array<{ stage: string; detail?: unknown }> = [];
  let stage = 'upload';

  if (!req.file) {
    return res.status(400).json({
      success: false,
      stage,
      reason: 'missing_audio',
      message: 'multipart field "audio" is required',
    });
  }

  const filePath = req.file.path;
  const finish = (status: number, body: Record<string, unknown>) => {
    timings.totalMs = now() - startedAt;
    res.status(status).json({ ...body, timings, trace });
  };

  try {
    trace.push({ stage: 'upload', detail: { bytes: req.file.size, mimetype: req.file.mimetype } });

    // --- Stage: active mode -------------------------------------------------
    stage = 'active_mode';
    let t = now();
    const activeMode = await Mode.findOne({ userId: DEMO_USER_ID, active: true }).lean();
    timings.activeModeMs = now() - t;
    if (!activeMode) {
      trace.push({ stage });
      return finish(409, {
        success: false,
        stage,
        reason: 'no_active_mode',
        message: 'No mode is active. Select a mode in the app first.',
      });
    }
    trace.push({ stage, detail: { mode: activeMode.name, modeId: String(activeMode._id) } });

    // --- Stage: model -------------------------------------------------------
    stage = 'model';
    t = now();
    const prediction = await predictAudio(filePath);
    timings.modelMs = now() - t;
    if (prediction.timings) Object.assign(timings, prediction.timings);
    trace.push({
      stage,
      detail: {
        modelLabel: prediction.modelLabel,
        eventKey: prediction.eventKey,
        confidence: prediction.confidence,
        audioSeconds: prediction.audioSeconds,
        candidates: prediction.candidates?.slice(0, 5),
      },
    });

    // --- Stage: catalog match ----------------------------------------------
    // The model derives eventKey by slugifying its own label and the catalog keys
    // are built by the identical rule, so this only fails if the two vocabularies
    // have genuinely drifted -- worth reporting explicitly rather than 500ing.
    stage = 'catalog_match';
    const definition = resolveEvent({
      eventKey: prediction.eventKey ?? undefined,
      modelLabel: prediction.modelLabel ?? undefined,
    });
    if (!definition) {
      return finish(200, {
        success: false,
        stage,
        reason: 'unmatched_event',
        message: prediction.modelLabel
          ? `Model reported "${prediction.modelLabel}", which is not in the event catalog.`
          : 'The clip did not match any watched sound event.',
        data: {
          modelLabel: prediction.modelLabel,
          confidence: prediction.confidence,
          topOverall: prediction.topOverall,
        },
      });
    }
    trace.push({ stage, detail: { eventKey: definition.key, label: definition.label } });

    // --- Stage: mode setting lookup ----------------------------------------
    stage = 'mode_setting';
    const setting = activeMode.eventSettings.find((item) => item.eventKey === definition.key);
    if (!setting) {
      return finish(200, {
        success: false,
        stage,
        reason: 'event_not_in_mode',
        message: `"${definition.label}" has no toggle in mode "${activeMode.name}". Re-seed or edit the mode.`,
        data: { event: definition.key, label: definition.label, mode: activeMode.name },
      });
    }
    if (!setting.enabled) {
      return finish(200, {
        success: false,
        stage,
        reason: 'event_not_enabled',
        message: `"${definition.label}" is switched off in mode "${activeMode.name}".`,
        data: {
          event: definition.key,
          label: definition.label,
          modelLabel: prediction.modelLabel,
          confidence: prediction.confidence,
          mode: activeMode.name,
        },
      });
    }
    trace.push({ stage, detail: { enabled: true, attention: setting.attention } });

    // --- Stage: confidence gate --------------------------------------------
    stage = 'confidence';
    if (MIN_CONFIDENCE > 0 && prediction.confidence < MIN_CONFIDENCE) {
      return finish(200, {
        success: false,
        stage,
        reason: 'low_confidence',
        message: `"${definition.label}" scored ${prediction.confidence}, below the ${MIN_CONFIDENCE} threshold.`,
        data: {
          event: definition.key,
          label: definition.label,
          confidence: prediction.confidence,
          threshold: MIN_CONFIDENCE,
          candidates: prediction.candidates,
        },
      });
    }

    // --- Stage: persist -----------------------------------------------------
    stage = 'persist';
    const rawDirection = String(req.body?.direction ?? 'unknown');
    const direction = isDirection(rawDirection) ? rawDirection : 'unknown';
    t = now();
    const saved = await Detection.create({
      userId: DEMO_USER_ID,
      eventKey: definition.key,
      modelLabel: prediction.modelLabel ?? '',
      label: definition.label,
      direction,
      confidence: prediction.confidence,
      attention: setting.attention,
      modeId: activeMode._id,
      modeName: activeMode.name,
      source: 'simulation',
      phoneNotification: setting.phoneNotification,
      xLight: setting.xLight,
      vibration: setting.vibration,
    });
    timings.persistMs = now() - t;
    trace.push({ stage, detail: { id: String(saved._id) } });

    timings.totalMs = now() - startedAt;
    console.log(
      `[detections/audio] ok event=${definition.key} model="${prediction.modelLabel}" ` +
        `conf=${prediction.confidence} mode=${activeMode.name} notify=${setting.phoneNotification} ` +
        `total=${timings.totalMs}ms (model=${timings.modelMs}ms db=${timings.persistMs}ms)`,
    );

    res.json({
      success: true,
      stage: 'complete',
      data: {
        id: saved._id,
        event: definition.key,
        eventKey: definition.key,
        modelLabel: prediction.modelLabel,
        label: definition.label,
        direction,
        directionLabel: directionLabel(direction),
        confidence: prediction.confidence,
        attention: setting.attention,
        mode: activeMode.name,
        modeId: String(activeMode._id),
        createdAt: saved.createdAt,
        // Only the active mode's own switch decides whether the phone alerts.
        notify: setting.phoneNotification,
        candidates: prediction.candidates,
        xResponse: {
          light: setting.xLight,
          vibration: setting.vibration,
          color:
            setting.attention === 'critical' ? 'red'
            : setting.attention === 'high' ? 'orange'
            : setting.attention === 'medium' ? 'yellow'
            : 'green',
          text: definition.label.toUpperCase(),
          durationSeconds: 5,
        },
      },
      timings,
      trace,
    });
  } catch (error) {
    if (error instanceof ModelServiceError) {
      console.error(`[detections/audio] failed stage=${error.stage}: ${error.message}`);
      const status = error.stage === 'timeout' ? 504 : error.stage === 'connect' ? 503 : 502;
      return finish(status, {
        success: false,
        stage: `model:${error.stage}`,
        reason: error.stage,
        message: error.message,
      });
    }
    console.error(`[detections/audio] failed stage=${stage}:`, error);
    next(error);
  } finally {
    await fs.rm(filePath, { force: true }).catch(() => undefined);
  }
});

/**
 * Replays the exact post-model half of the pipeline for a chosen event, so the
 * mode/toggle/notification wiring can be exercised without an audio file.
 */
detectionsRouter.post('/simulate', async (req, res, next) => {
  try {
    const { eventKey, direction: rawDirection, confidence } = req.body as {
      eventKey?: string;
      direction?: string;
      confidence?: number;
    };
    const definition = resolveEvent({ eventKey, modelLabel: eventKey, label: eventKey });
    if (!definition) {
      return res.status(400).json({
        success: false,
        reason: 'unmatched_event',
        message: `Unknown eventKey "${eventKey}".`,
        data: { validKeys: EVENT_CATALOG.map((entry) => entry.key) },
      });
    }

    const activeMode = await Mode.findOne({ userId: DEMO_USER_ID, active: true }).lean();
    if (!activeMode) return res.status(409).json({ success: false, reason: 'no_active_mode', message: 'No mode is active.' });

    const setting = activeMode.eventSettings.find((item) => item.eventKey === definition.key);
    if (!setting?.enabled) {
      return res.json({
        success: false,
        reason: setting ? 'event_not_enabled' : 'event_not_in_mode',
        message: `"${definition.label}" is not active in mode "${activeMode.name}".`,
        data: { event: definition.key, label: definition.label, mode: activeMode.name },
      });
    }

    const direction = isDirection(String(rawDirection)) ? String(rawDirection) : 'unknown';
    const saved = await Detection.create({
      userId: DEMO_USER_ID,
      eventKey: definition.key,
      modelLabel: definition.modelLabel,
      label: definition.label,
      direction,
      confidence: typeof confidence === 'number' ? confidence : 0.9,
      attention: setting.attention,
      modeId: activeMode._id,
      modeName: activeMode.name,
      source: 'simulation',
      phoneNotification: setting.phoneNotification,
      xLight: setting.xLight,
      vibration: setting.vibration,
    });

    res.status(201).json({
      success: true,
      data: {
        id: saved._id,
        event: definition.key,
        label: definition.label,
        direction,
        directionLabel: directionLabel(direction),
        confidence: saved.confidence,
        attention: setting.attention,
        mode: activeMode.name,
        notify: setting.phoneNotification,
        createdAt: saved.createdAt,
      },
    });
  } catch (error) { next(error); }
});

detectionsRouter.get('/meta/directions', (_req, res) => res.json({ success: true, data: DIRECTIONS }));
