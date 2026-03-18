import { eq } from 'drizzle-orm';
import type { DB } from './db.js';
import { executionRuns } from './schema.js';
import type { ExecutionRun, CreateExecutionRunInput, UpdateExecutionRunInput } from './types.js';
import { toJson, fromJson } from './json-utils.js';

type ExecutionRunRow = typeof executionRuns.$inferSelect;

function rowToExecutionRun(row: ExecutionRunRow): ExecutionRun {
  return {
    id: row.id,
    workflowId: row.workflowId,
    status: row.status,
    startedAt: (row.startedAt as Date | null),
    completedAt: (row.completedAt as Date | null),
    cancelledAt: (row.cancelledAt as Date | null) ?? null,
    stepResults: fromJson(row.stepResults),
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export function createExecutionRun(db: DB, input: CreateExecutionRunInput): ExecutionRun {
  const now = new Date();
  db.insert(executionRuns).values({
    id: input.id,
    workflowId: input.workflowId,
    status: input.status,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    cancelledAt: input.cancelledAt ?? null,
    stepResults: toJson(input.stepResults),
    createdAt: now,
    updatedAt: now,
  }).run();
  return getExecutionRunById(db, input.id)!;
}

export function getExecutionRunById(db: DB, id: string): ExecutionRun | null {
  const row = db.select().from(executionRuns).where(eq(executionRuns.id, id)).get();
  return row ? rowToExecutionRun(row) : null;
}

export function listExecutionRuns(db: DB): ExecutionRun[] {
  return db.select().from(executionRuns).all().map(rowToExecutionRun);
}

export function updateExecutionRun(db: DB, id: string, input: UpdateExecutionRunInput): ExecutionRun | null {
  const updates: Partial<ExecutionRunRow> = { updatedAt: new Date() };
  if (input.workflowId !== undefined) updates.workflowId = input.workflowId;
  if (input.status !== undefined) updates.status = input.status;
  if (input.startedAt !== undefined) updates.startedAt = input.startedAt;
  if (input.completedAt !== undefined) updates.completedAt = input.completedAt;
  if (input.cancelledAt !== undefined) updates.cancelledAt = input.cancelledAt;
  if (input.stepResults !== undefined) updates.stepResults = toJson(input.stepResults);
  db.update(executionRuns).set(updates).where(eq(executionRuns.id, id)).run();
  return getExecutionRunById(db, id);
}

export function deleteExecutionRun(db: DB, id: string): boolean {
  const result = db.delete(executionRuns).where(eq(executionRuns.id, id)).run();
  return result.changes > 0;
}
