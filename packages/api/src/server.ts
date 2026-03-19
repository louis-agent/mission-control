import { randomUUID } from 'crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createDb } from '@mission-control/core';
import { createRegistryApp } from './registry.js';
import { createQueueApp } from './queue.js';
import { createWorkflowRunnerApp } from './workflow-runner.js';
import { createApiKeysApp } from './api-keys.js';
import { createAuditLogApp } from './audit-log.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limiter.js';
import { createAuditLoggerMiddleware } from './middleware/audit-logger.js';
import { errorHandler } from './errors.js';
import { logger } from './logger.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const DB_PATH = process.env.DB_PATH ?? './mission-control.db';
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? '10000', 10);

const db = createDb(DB_PATH);

const app = express();
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

// ── Security middleware ───────────────────────────────────────────────────────
// Health check is exempt from auth (registered before auth middleware)
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

const DISABLE_AUTH = process.env.DISABLE_AUTH === 'true';
if (!DISABLE_AUTH) {
  app.use(createAuthMiddleware(db));
}
app.use(rateLimitMiddleware);
app.use(createAuditLoggerMiddleware(db));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use(createRegistryApp(db));
app.use(createQueueApp(db));
app.use(createWorkflowRunnerApp(db));
app.use(createApiKeysApp(db));
app.use(createAuditLogApp(db));

// ── Centralised error handler (must be last) ──────────────────────────────────
app.use(errorHandler);

// ── Server startup ────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info({ port: PORT, db: DB_PATH }, 'Mission Control API started');
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');

  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error during server close');
      process.exit(1);
    }
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
