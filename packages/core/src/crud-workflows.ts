import { eq } from 'drizzle-orm';
import type { DB } from './db.js';
import { workflows } from './schema.js';
import type { Workflow, CreateWorkflowInput, UpdateWorkflowInput } from './types.js';
import { toJson, fromJson } from './json-utils.js';

type WorkflowRow = typeof workflows.$inferSelect;

function rowToWorkflow(row: WorkflowRow): Workflow {
  return {
    id: row.id,
    name: row.name,
    steps: fromJson(row.steps),
    status: row.status,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export function createWorkflow(db: DB, input: CreateWorkflowInput): Workflow {
  const now = new Date();
  db.insert(workflows).values({
    id: input.id,
    name: input.name,
    steps: toJson(input.steps),
    status: input.status,
    createdAt: now,
    updatedAt: now,
  }).run();
  return getWorkflowById(db, input.id)!;
}

export function getWorkflowById(db: DB, id: string): Workflow | null {
  const row = db.select().from(workflows).where(eq(workflows.id, id)).get();
  return row ? rowToWorkflow(row) : null;
}

export function listWorkflows(db: DB): Workflow[] {
  return db.select().from(workflows).all().map(rowToWorkflow);
}

export function updateWorkflow(db: DB, id: string, input: UpdateWorkflowInput): Workflow | null {
  const updates: Partial<WorkflowRow> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.steps !== undefined) updates.steps = toJson(input.steps);
  if (input.status !== undefined) updates.status = input.status;
  db.update(workflows).set(updates).where(eq(workflows.id, id)).run();
  return getWorkflowById(db, id);
}

export function deleteWorkflow(db: DB, id: string): boolean {
  const result = db.delete(workflows).where(eq(workflows.id, id)).run();
  return result.changes > 0;
}
