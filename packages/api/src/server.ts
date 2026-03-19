import { randomUUID } from 'crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createDb, EventBus, LocalStorageAdapter } from '@mission-control/core';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DASHBOARD_DIR = join(__dirname, '../public');
import { createSseApp } from './sse.js';
import { createRegistryApp } from './registry.js';
import { createQueueApp } from './queue.js';
import { createWorkflowRunnerApp } from './workflow-runner.js';
import { createApiKeysApp } from './api-keys.js';
import { createAuditLogApp } from './audit-log.js';
import { createWebhooksApp } from './webhooks.js';
import { createOpenApiApp } from './openapi.js';
import { createMetricsApp } from './metrics.js';
import { createDashboardApp } from './dashboard.js';
import { createAlertsApp } from './alerts.js';
import { createPluginManagerApp } from './plugin-manager.js';
import { createStorageApp } from './storage-api.js';
import { createGitHubApp } from './github.js';
import { createSlackApp } from './slack.js';
import { createJobsApp } from './jobs.js';
import { JobWorker } from './job-worker.js';
import { workflowExecutionHandler, webhookDeliveryHandler, metricAggregationHandler } from './job-handlers.js';
import { initTracing, shutdownTracing } from './tracing.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limiter.js';
import { createAuditLoggerMiddleware } from './middleware/audit-logger.js';
import { errorHandler } from './errors.js';
import { logger } from './logger.js';

// Initialise OpenTelemetry before everything else (no-op if OTEL_ENABLED != true)
initTracing();

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const DB_PATH = process.env.DB_PATH ?? './mission-control.db';
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? '10000', 10);
const STORAGE_DIR = process.env.STORAGE_DIR ?? './artifacts';

const db = createDb(DB_PATH);
const eventBus = new EventBus(db);
const storage = new LocalStorageAdapter(STORAGE_DIR);

const app = express();

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? '';
if (GITHUB_WEBHOOK_SECRET) {
  // Register before express.json() to preserve raw body for HMAC
  app.use(createGitHubApp(eventBus, { webhookSecret: GITHUB_WEBHOOK_SECRET }));
}

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? '';
if (SLACK_SIGNING_SECRET) {
  // Register before express.json() to preserve raw body for signature verification
  app.use(createSlackApp(eventBus, { signingSecret: SLACK_SIGNING_SECRET }));
}

app.use(express.static(DASHBOARD_DIR));
app.use(express.json());

// ── Request logging middleware ─────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) ?? randomUUID();
  req.headers['x-correlation-id'] = correlationId;
  const start = Date.now();

  res.on('finish', () => {
    logger.info(
      {
        correlationId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - start,
      },
      'request',
    );
  });

  next();
});

// ── Public endpoints (exempt from auth) ──────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// /metrics is typically scraped by Prometheus (no auth to avoid token leakage)
app.use(createMetricsApp(db));

const DISABLE_AUTH = process.env.DISABLE_AUTH === 'true';
if (!DISABLE_AUTH) {
  app.use(createAuthMiddleware(db));
}
app.use(rateLimitMiddleware);
app.use(createAuditLoggerMiddleware(db));

// ── SSE (served at root so browser EventSource connects without /api prefix) ──
app.use(createSseApp(eventBus));

// ── API routes (all under /api prefix, matching the dashboard client's BASE) ──
const apiRouter = express.Router();
apiRouter.use(createRegistryApp(db));
apiRouter.use(createQueueApp(db));
apiRouter.use(createWorkflowRunnerApp(db));
apiRouter.use(createApiKeysApp(db));
apiRouter.use(createAuditLogApp(db));
apiRouter.use(createWebhooksApp(db));
apiRouter.use(createDashboardApp(db));
apiRouter.use(createAlertsApp(db));
apiRouter.use(createPluginManagerApp());
apiRouter.use(createStorageApp(storage));
apiRouter.use(createJobsApp(db));
apiRouter.use(createOpenApiApp());
app.use('/api', apiRouter);

// ── SPA catch-all: serve index.html for any unmatched route ──────────────────
const INDEX_HTML = join(DASHBOARD_DIR, 'index.html');
app.get('/{*path}', (_req: Request, res: Response) => {
  res.sendFile(INDEX_HTML);
});

// ── Centralised error handler (must be last) ──────────────────────────────────
app.use(errorHandler);

// ── Background job worker ─────────────────────────────────────────────────────
const worker = new JobWorker(db)
  .register('workflow_execution', workflowExecutionHandler)
  .register('webhook_delivery', webhookDeliveryHandler)
  .register('metric_aggregation', metricAggregationHandler);

// ── Server startup ────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info({ port: PORT, db: DB_PATH }, 'Mission Control API started');
  worker.start();
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');

  worker.stop();
  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error during server close');
      process.exit(1);
    }
    await shutdownTracing();
    logger.info('Server closed cleanly');
    process.exit(0);
  });

  // Force-kill after timeout if in-flight requests don't drain
  setTimeout(() => {
    logger.warn({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'Forcing shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
