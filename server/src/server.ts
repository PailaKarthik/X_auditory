import 'dotenv/config';
import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { modesRouter } from './routes/modes.js';
import { detectionsRouter } from './routes/detections.js';
import { sttRouter } from './routes/stt.js';
import { deviceRouter } from './routes/device.js';
import { errorHandler } from './middleware/errorHandler.js';
import { seedDemoData } from './services/seed.js';
import { modelServiceHealth } from './services/modelClient.js';
import { EVENT_CATALOG } from './utils/catalog.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/x_auditory';
const MODEL_SERVICE_URL = process.env.MODEL_SERVICE_URL ?? 'http://127.0.0.1:8020';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// One line per request with its duration. Atlas is a remote hop, so knowing which
// endpoint is slow is the difference between guessing and fixing.
const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS ?? 400);
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const marker = ms >= SLOW_REQUEST_MS ? ' SLOW' : '';
    if (ms >= SLOW_REQUEST_MS || res.statusCode >= 400) {
      console.log(`[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(0)}ms${marker}`);
    }
  });
  next();
});

app.get('/api/v1/health', (_req, res) =>
  res.json({
    success: true,
    data: {
      service: 'x-auditory-api',
      status: 'ok',
      mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      events: EVENT_CATALOG.length,
      time: new Date().toISOString(),
    },
  }),
);

/** Deep health: confirms the model service is up and shows the label->key contract. */
app.get('/api/v1/health/full', async (_req, res) => {
  const model = await modelServiceHealth();
  res.json({
    success: true,
    data: {
      api: 'ok',
      mongo: { state: mongoose.connection.readyState, database: mongoose.connection.name },
      modelService: { url: MODEL_SERVICE_URL, ...model },
      catalog: EVENT_CATALOG.map((entry) => ({
        eventKey: entry.key,
        modelLabel: entry.modelLabel,
        label: entry.label,
      })),
    },
  });
});

app.use('/api/v1/modes', modesRouter);
app.use('/api/v1/detections', detectionsRouter);
app.use('/api/v1/stt', sttRouter);
app.use('/api/v1/device', deviceRouter);
app.get('/api/v1/analytics', (_req, res) => res.redirect(307, '/api/v1/device/analytics'));

app.use(errorHandler);

// mongodb+srv:// needs a DNS SRV lookup. Some local resolvers (VPNs, router DNS at
// 127.0.0.1) refuse SRV records, which surfaces as `querySrv ECONNREFUSED`. Retry
// once against public resolvers before giving up.
const DNS_FALLBACK = (process.env.DNS_SERVERS ?? '8.8.8.8,1.1.1.1').split(',').map((s) => s.trim()).filter(Boolean);

function isSrvLookupFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /querySrv|queryTxt|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEOUT/.test(message);
}

async function connectMongo() {
  const options = {
    serverSelectionTimeoutMS: 15000,
    // Atlas is a remote hop; a warm pool avoids paying TLS setup on burst traffic.
    maxPoolSize: 10,
    minPoolSize: 2,
  } as const;
  try {
    await mongoose.connect(mongoUri, options);
  } catch (error) {
    if (!mongoUri.startsWith('mongodb+srv://') || !isSrvLookupFailure(error)) throw error;
    console.warn(`DNS SRV lookup failed via system resolver (${dns.getServers().join(', ')}). Retrying with ${DNS_FALLBACK.join(', ')}.`);
    dns.setServers(DNS_FALLBACK);
    await mongoose.connect(mongoUri, options);
  }
  console.log(`MongoDB connected (database: ${mongoose.connection.name})`);
}

async function bootstrap() {
  await connectMongo();
  await seedDemoData();

  const server = app.listen(port, () => {
    console.log(`X API listening on http://localhost:${port}`);
    console.log(`  model service  ${MODEL_SERVICE_URL}`);
    console.log(`  catalog        ${EVENT_CATALOG.length} events`);
    console.log(`  demo user      ${process.env.DEMO_USER_ID ?? 'demo-user'}`);
  });

  const stop = async (signal: string) => {
    console.log(`\n${signal} received, shutting down`);
    server.close();
    await mongoose.disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));
}

bootstrap().catch((error) => {
  console.error('Failed to start X API', error);
  process.exit(1);
});
