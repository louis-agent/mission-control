import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import type { DB } from './db.js';
import { jobs } from './schema.js';
import { toJson, fromJson } from './json-utils.js';

export type JobType = 'workflow_execution' | 'webhook_delivery' | 'metric_aggregation';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  claimedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateJobInput = {
  id?: string;
  type: JobType;
  payload: Record<string, unknown>;
  maxAttempts?: number;
};

type JobRow = typeof jobs.$inferSelect;

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    payload: fromJson<Record<string, unknown>>(row.payload),
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    errorMessage: row.errorMessage ?? null,
    claimedAt: (row.claimedAt as Date | null) ?? null,
    completedAt: (row.completedAt as Date | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export function createJob(db: DB, input: CreateJobInput): Job {
  const now = new Date();
  const id = input.id ?? randomUUID();
  db.insert(jobs).values({
    id,
    type: input.type,
    status: 'pending',
    payload: toJson(input.payload),
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    errorMessage: null,
    claimedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  }).run();
  return getJobById(db, id)!;
}

export function getJobById(db: DB, id: string): Job | null {
  const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
  return row ? rowToJob(row) : null;
}

export function listPendingJobs(db: DB, limit = 10): Job[] {
  return db.select().from(jobs)
    .where(eq(jobs.status, 'pending'))
    .all()
    .map(rowToJob)
    .slice(0, limit);
}

/**
 * Atomically claim a job for processing (pending → running).
 * Returns null if the job no longer exists or is not pending.
 */
export function claimJob(db: DB, id: string): Job | null {
  const now = new Date();
  const result = db.update(jobs)
    .set({ status: 'running', claimedAt: now, updatedAt: now })
    .where(and(eq(jobs.id, id), eq(jobs.status, 'pending')))
    .run();
  if (result.changes === 0) return null;
  return getJobById(db, id);
}

export function completeJob(db: DB, id: string): Job | null {
  const now = new Date();
  db.update(jobs)
    .set({ status: 'completed', completedAt: now, updatedAt: now })
    .where(eq(jobs.id, id))
    .run();
  return getJobById(db, id);
}

export function failJob(db: DB, id: string, errorMessage: string): Job | null {
  const job = getJobById(db, id);
  if (!job) return null;
  const now = new Date();
  const nextAttempts = job.attempts + 1;
  const exhausted = nextAttempts >= job.maxAttempts;
  db.update(jobs).set({
    status: exhausted ? 'failed' : 'pending',
    attempts: nextAttempts,
    errorMessage,
    claimedAt: null,
    updatedAt: now,
  }).where(eq(jobs.id, id)).run();
  return getJobById(db, id);
}

export function listJobs(db: DB): Job[] {
  return db.select().from(jobs).all().map(rowToJob);
}
