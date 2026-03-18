import { eq } from 'drizzle-orm';
import type { DB } from './db.js';
import { tasks } from './schema.js';
import type { Task, CreateTaskInput, UpdateTaskInput } from './types.js';
import { toJson, fromJson } from './json-utils.js';

type TaskRow = typeof tasks.$inferSelect;

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    requiredCapabilities: fromJson<string[]>(row.requiredCapabilities),
    assigneeAgentId: row.assigneeAgentId,
    workflowId: row.workflowId,
    executionRunId: row.executionRunId ?? null,
    stepId: row.stepId ?? null,
    dependencies: fromJson<string[]>(row.dependencies),
    input: fromJson<Record<string, unknown>>(row.input),
    output: fromJson<Record<string, unknown>>(row.output),
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export function createTask(db: DB, input: CreateTaskInput): Task {
  const now = new Date();
  db.insert(tasks).values({
    id: input.id,
    title: input.title,
    description: input.description,
    status: input.status,
    requiredCapabilities: toJson(input.requiredCapabilities),
    assigneeAgentId: input.assigneeAgentId,
    workflowId: input.workflowId,
    executionRunId: input.executionRunId ?? null,
    stepId: input.stepId ?? null,
    dependencies: toJson(input.dependencies),
    input: toJson(input.input),
    output: toJson(input.output),
    errorMessage: input.errorMessage ?? null,
    createdAt: now,
    updatedAt: now,
  }).run();
  return getTaskById(db, input.id)!;
}

export function getTaskById(db: DB, id: string): Task | null {
  const row = db.select().from(tasks).where(eq(tasks.id, id)).get();
  return row ? rowToTask(row) : null;
}

export function listTasks(db: DB): Task[] {
  return db.select().from(tasks).all().map(rowToTask);
}

export function updateTask(db: DB, id: string, input: UpdateTaskInput): Task | null {
  const updates: Partial<TaskRow> = { updatedAt: new Date() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.status !== undefined) updates.status = input.status;
  if (input.requiredCapabilities !== undefined) updates.requiredCapabilities = toJson(input.requiredCapabilities);
  if (input.assigneeAgentId !== undefined) updates.assigneeAgentId = input.assigneeAgentId;
  if (input.workflowId !== undefined) updates.workflowId = input.workflowId;
  if (input.executionRunId !== undefined) updates.executionRunId = input.executionRunId;
  if (input.stepId !== undefined) updates.stepId = input.stepId;
  if (input.dependencies !== undefined) updates.dependencies = toJson(input.dependencies);
  if (input.input !== undefined) updates.input = toJson(input.input);
  if (input.output !== undefined) updates.output = toJson(input.output);
  if (input.errorMessage !== undefined) updates.errorMessage = input.errorMessage;
  db.update(tasks).set(updates).where(eq(tasks.id, id)).run();
  return getTaskById(db, id);
}

export function deleteTask(db: DB, id: string): boolean {
  const result = db.delete(tasks).where(eq(tasks.id, id)).run();
  return result.changes > 0;
}

export function listPendingTasks(db: DB): Task[] {
  return db.select().from(tasks)
    .where(eq(tasks.status, 'pending'))
    .all()
    .map(rowToTask)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export function listTasksByStatus(db: DB, status: Task['status']): Task[] {
  return db.select().from(tasks)
    .where(eq(tasks.status, status))
    .all()
    .map(rowToTask);
}

export function listTasksByExecutionRun(db: DB, executionRunId: string): Task[] {
  return db.select().from(tasks)
    .where(eq(tasks.executionRunId, executionRunId))
    .all()
    .map(rowToTask);
}
