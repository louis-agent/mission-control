/**
 * Background job worker.
 *
 * Polls the jobs table at a configurable interval, claims pending jobs, and
 * dispatches them to type-specific handlers. Runs concurrently up to a
 * configurable maximum.
 *
 * Configuration (env vars):
 *   WORKER_POLL_INTERVAL_MS  — how often to poll for new jobs (default: 2000)
 *   WORKER_CONCURRENCY       — max concurrent jobs in flight (default: 4)
 */

import {
  listPendingJobs,
  claimJob,
  completeJob,
  failJob,
  type DB,
  type Job,
} from '@mission-control/core';
import { logger } from './logger.js';

export type JobHandler = (job: Job, db: DB) => Promise<void>;

const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS ?? '2000', 10);
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? '4', 10);

export class JobWorker {
  private readonly handlers = new Map<string, JobHandler>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = 0;
  private stopped = false;

  constructor(private readonly db: DB) {}

  register(type: string, handler: JobHandler): this {
    this.handlers.set(type, handler);
    return this;
  }

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    logger.info({ pollIntervalMs: POLL_INTERVAL_MS, concurrency: CONCURRENCY }, 'job-worker started');
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('job-worker stopped');
  }

  private async poll(): Promise<void> {
    if (this.stopped || this.inFlight >= CONCURRENCY) return;

    const available = CONCURRENCY - this.inFlight;
    const pending = listPendingJobs(this.db, available);

    for (const job of pending) {
      if (this.inFlight >= CONCURRENCY) break;
      const claimed = claimJob(this.db, job.id);
      if (!claimed) continue; // already claimed by another worker instance
      this.inFlight++;
      void this.execute(claimed);
    }
  }

  private async execute(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      logger.warn({ jobId: job.id, type: job.type }, 'no handler registered for job type');
      failJob(this.db, job.id, `No handler registered for job type: ${job.type}`);
      this.inFlight--;
      return;
    }

    try {
      await handler(job, this.db);
      completeJob(this.db, job.id);
      logger.info({ jobId: job.id, type: job.type }, 'job completed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const updated = failJob(this.db, job.id, msg);
      logger.error({ jobId: job.id, type: job.type, err, status: updated?.status }, 'job failed');
    } finally {
      this.inFlight--;
    }
  }
}
