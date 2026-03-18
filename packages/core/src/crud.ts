import { eq } from 'drizzle-orm';
import type { DB } from './db.js';
import { agents, tasks, workflows, executionRuns, events } from './schema.js';
import type {
  Agent, CreateAgentInput, UpdateAgentInput,
  Task, CreateTaskInput, UpdateTaskInput,
  Workflow, CreateWorkflowInput, UpdateWorkflowInput,
  ExecutionRun, CreateExecutionRunInput, UpdateExecutionRunInput,
  Event, CreateEventInput,
} from './types.js';

// ──────────────────────────────────────────────────────────────────────────────
// JSON helpers
// ──────────────────────────────────────────────────────────────────────────────

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function fromJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

// ──────────────────────────────────────────────────────────────────────────────
// Agent CRUD
// ──────────────────────────────────────────────────────────────────────────────

type AgentRow = typeof agents.$inferSelect;

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    capabilities: fromJson<string[]>(row.capabilities),
    status: row.status,
    metadata: fromJson<Record<string, unknown>>(row.metadata),
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export function createAgent(db: DB, input: CreateAgentInput): Agent {
  const now = new Date();
  db.insert(agents).values({
    id: input.id,
    name: input.name,
    capabilities: toJson(input.capabilities),
    status: input.status,
    metadata: toJson(input.metadata),
    createdAt: now,
    updatedAt: now,
  }).run();
  return getAgentById(db, input.id)!;
}

export function getAgentById(db: DB, id: string): Agent | null {
  const row = db.select().from(agents).where(eq(agents.id, id)).get();
  return row ? rowToAgent(row) : null;
}

export function listAgents(db: DB): Agent[] {
  return db.select().from(agents).all().map(rowToAgent);
}

export function updateAgent(db: DB, id: string, input: UpdateAgentInput): Agent | null {
  const updates: Partial<AgentRow> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.capabilities !== undefined) updates.capabilities = toJson(input.capabilities);
  if (input.status !== undefined) updates.status = input.status;
  if (input.metadata !== undefined) updates.metadata = toJson(input.metadata);
  db.update(agents).set(updates).where(eq(agents.id, id)).run();
  return getAgentById(db, id);
}

export function deleteAgent(db: DB, id: string): boolean {
  const result = db.delete(agents).where(eq(agents.id, id)).run();
  return result.changes > 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// Task CRUD
// ──────────────────────────────────────────────────────────────────────────────

type TaskRow = typeof tasks.$inferSelect;

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    assigneeAgentId: row.assigneeAgentId,
    workflowId: row.workflowId,
    dependencies: fromJson<string[]>(row.dependencies),
    input: fromJson<Record<string, unknown>>(row.input),
    output: fromJson<Record<string, unknown>>(row.output),
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
    assigneeAgentId: input.assigneeAgentId,
    workflowId: input.workflowId,
    dependencies: toJson(input.dependencies),
    input: toJson(input.input),
    output: toJson(input.output),
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
  if (input.assigneeAgentId !== undefined) updates.assigneeAgentId = input.assigneeAgentId;
  if (input.workflowId !== undefined) updates.workflowId = input.workflowId;
  if (input.dependencies !== undefined) updates.dependencies = toJson(input.dependencies);
  if (input.input !== undefined) updates.input = toJson(input.input);
  if (input.output !== undefined) updates.output = toJson(input.output);
  db.update(tasks).set(updates).where(eq(tasks.id, id)).run();
  return getTaskById(db, id);
}

export function deleteTask(db: DB, id: string): boolean {
  const result = db.delete(tasks).where(eq(tasks.id, id)).run();
  return result.changes > 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// Workflow CRUD
// ──────────────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────────────
// ExecutionRun CRUD
// ──────────────────────────────────────────────────────────────────────────────

type ExecutionRunRow = typeof executionRuns.$inferSelect;

function rowToExecutionRun(row: ExecutionRunRow): ExecutionRun {
  return {
    id: row.id,
    workflowId: row.workflowId,
    status: row.status,
    startedAt: (row.startedAt as Date | null),
    completedAt: (row.completedAt as Date | null),
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
  if (input.stepResults !== undefined) updates.stepResults = toJson(input.stepResults);
  db.update(executionRuns).set(updates).where(eq(executionRuns.id, id)).run();
  return getExecutionRunById(db, id);
}

export function deleteExecutionRun(db: DB, id: string): boolean {
  const result = db.delete(executionRuns).where(eq(executionRuns.id, id)).run();
  return result.changes > 0;
}

// ──────────────────────────────────────────────────────────────────────────────
// Event CRUD (append-only — no update or delete)
// ──────────────────────────────────────────────────────────────────────────────

type EventRow = typeof events.$inferSelect;

function rowToEvent(row: EventRow): Event {
  return {
    id: row.id,
    type: row.type,
    source: row.source,
    payload: fromJson<Record<string, unknown>>(row.payload),
    timestamp: row.timestamp as Date,
    createdAt: row.createdAt as Date,
  };
}

export function createEvent(db: DB, input: CreateEventInput): Event {
  const now = new Date();
  db.insert(events).values({
    id: input.id,
    type: input.type,
    source: input.source,
    payload: toJson(input.payload),
    timestamp: input.timestamp,
    createdAt: now,
  }).run();
  return getEventById(db, input.id)!;
}

export function getEventById(db: DB, id: string): Event | null {
  const row = db.select().from(events).where(eq(events.id, id)).get();
  return row ? rowToEvent(row) : null;
}

export function listEvents(db: DB): Event[] {
  return db.select().from(events).all().map(rowToEvent);
}
