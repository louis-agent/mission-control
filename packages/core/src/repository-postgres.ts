/**
 * PostgreSQL repository adapters using Drizzle ORM + postgres-js.
 *
 * Use createPostgresRepositories(connectionString) to get all repositories.
 * The connection string is typically from DATABASE_URL (e.g. postgres://user:pass@host:5432/db).
 *
 * Note: run the migration SQL in migrations/ against your PostgreSQL database before use.
 */

import { randomUUID, createHash } from 'crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, like, and, gte, lte, sql } from 'drizzle-orm';
import * as schema from './schema-postgres.js';
import type {
  Agent, CreateAgentInput, UpdateAgentInput,
  Task, CreateTaskInput, UpdateTaskInput,
  Workflow, CreateWorkflowInput, UpdateWorkflowInput,
  ExecutionRun, CreateExecutionRunInput, UpdateExecutionRunInput,
  Event, CreateEventInput,
  ApiKey, CreateApiKeyInput,
  AuditLogEntry, CreateAuditLogInput,
  Webhook, CreateWebhookInput, UpdateWebhookInput,
} from './types.js';
import type { AuditLogFilter } from './crud-audit-log.js';
import type {
  AlertRule, AlertState, AlertStatus,
  CreateAlertRuleInput, UpdateAlertRuleInput,
} from './crud-alerts.js';
import type {
  AgentRepository, TaskRepository, WorkflowRepository, ExecutionRunRepository,
  EventRepository, ApiKeyRepository, AuditLogRepository, WebhookRepository,
  AlertRepository, Repositories,
} from './repository.js';

type PgDB = ReturnType<typeof drizzle>;

// ── Row → domain mappers ──────────────────────────────────────────────────────

function rowToAgent(row: typeof schema.agents.$inferSelect): Agent {
  return {
    id: row.id, name: row.name,
    capabilities: row.capabilities as string[],
    status: row.status,
    metadata: row.metadata as Record<string, unknown>,
    lastHeartbeatAt: row.lastHeartbeatAt ?? null,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

function rowToTask(row: typeof schema.tasks.$inferSelect): Task {
  const PRIORITY_FALLBACK: Task['priority'] = 'medium';
  return {
    id: row.id, title: row.title, description: row.description,
    status: row.status, priority: row.priority ?? PRIORITY_FALLBACK,
    requiredCapabilities: row.requiredCapabilities as string[],
    assigneeAgentId: row.assigneeAgentId ?? null,
    workflowId: row.workflowId ?? null,
    executionRunId: row.executionRunId ?? null,
    stepId: row.stepId ?? null,
    dependencies: row.dependencies as string[],
    input: row.input as Record<string, unknown>,
    output: row.output as Record<string, unknown>,
    errorMessage: row.errorMessage ?? null,
    maxRetries: row.maxRetries ?? 0,
    retryCount: row.retryCount ?? 0,
    retryDelay: row.retryDelay ?? 1000,
    timeoutAt: row.timeoutAt ?? null,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

function rowToWorkflow(row: typeof schema.workflows.$inferSelect): Workflow {
  return {
    id: row.id, name: row.name,
    steps: row.steps as Workflow['steps'],
    status: row.status,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

function rowToRun(row: typeof schema.executionRuns.$inferSelect): ExecutionRun {
  return {
    id: row.id, workflowId: row.workflowId,
    parentRunId: row.parentRunId ?? null,
    parentStepId: row.parentStepId ?? null,
    status: row.status,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    cancelledAt: row.cancelledAt ?? null,
    timeoutAt: row.timeoutAt ?? null,
    stepResults: row.stepResults as ExecutionRun['stepResults'],
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

function rowToApiKey(row: typeof schema.apiKeys.$inferSelect): ApiKey {
  return {
    id: row.id, name: row.name, hashedKey: row.hashedKey,
    agentId: row.agentId ?? null, role: row.role,
    createdAt: row.createdAt, expiresAt: row.expiresAt ?? null,
    revokedAt: row.revokedAt ?? null,
  };
}

function rowToWebhook(row: typeof schema.webhooks.$inferSelect): Webhook {
  return {
    id: row.id, url: row.url, events: row.events as string[],
    secret: row.secret, active: row.active,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

// ── Repository factory ────────────────────────────────────────────────────────

export function createPostgresRepositories(connectionString: string): Repositories {
  const client = postgres(connectionString);
  const db: PgDB = drizzle(client, { schema });

  const agents: AgentRepository = {
    async create(input: CreateAgentInput): Promise<Agent> {
      const now = new Date();
      await db.insert(schema.agents).values({
        id: input.id, name: input.name, capabilities: input.capabilities,
        status: input.status, metadata: input.metadata,
        lastHeartbeatAt: null, createdAt: now, updatedAt: now,
      });
      return (await agents.getById(input.id))!;
    },
    async getById(id: string) {
      const rows = await db.select().from(schema.agents).where(eq(schema.agents.id, id));
      return rows[0] ? rowToAgent(rows[0]) : null;
    },
    async list() {
      return (await db.select().from(schema.agents)).map(rowToAgent);
    },
    async listByCapability(cap: string) {
      const rows = await db.select().from(schema.agents)
        .where(sql`${schema.agents.capabilities}::text like ${`%"${cap}"%`}`);
      return rows.map(rowToAgent);
    },
    async update(id: string, input: UpdateAgentInput) {
      const now = new Date();
      const updates: Partial<typeof schema.agents.$inferInsert> = { updatedAt: now };
      if (input.name !== undefined) updates.name = input.name;
      if (input.capabilities !== undefined) updates.capabilities = input.capabilities;
      if (input.status !== undefined) updates.status = input.status;
      if (input.metadata !== undefined) updates.metadata = input.metadata;
      await db.update(schema.agents).set(updates).where(eq(schema.agents.id, id));
      return agents.getById(id);
    },
    async delete(id: string) {
      const result = await db.delete(schema.agents).where(eq(schema.agents.id, id));
      return (result as unknown as { count: number }).count > 0;
    },
    async heartbeat(id: string) {
      const now = new Date();
      await db.update(schema.agents).set({ lastHeartbeatAt: now, updatedAt: now })
        .where(eq(schema.agents.id, id));
      return agents.getById(id);
    },
  };

  const tasks: TaskRepository = {
    async create(input: CreateTaskInput): Promise<Task> {
      const now = new Date();
      await db.insert(schema.tasks).values({
        id: input.id, title: input.title, description: input.description,
        status: input.status, priority: input.priority ?? 'medium',
        requiredCapabilities: input.requiredCapabilities,
        assigneeAgentId: input.assigneeAgentId ?? null,
        workflowId: input.workflowId ?? null,
        executionRunId: input.executionRunId ?? null,
        stepId: input.stepId ?? null,
        dependencies: input.dependencies,
        input: input.input, output: input.output,
        errorMessage: input.errorMessage ?? null,
        maxRetries: input.maxRetries ?? 0,
        retryCount: input.retryCount ?? 0,
        retryDelay: input.retryDelay ?? 1000,
        timeoutAt: input.timeoutAt ?? null,
        createdAt: now, updatedAt: now,
      });
      return (await tasks.getById(input.id))!;
    },
    async getById(id: string) {
      const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
      return rows[0] ? rowToTask(rows[0]) : null;
    },
    async list() {
      return (await db.select().from(schema.tasks)).map(rowToTask);
    },
    async listPending() {
      const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.status, 'pending'));
      const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return rows.map(rowToTask).sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 2;
        const pb = PRIORITY_ORDER[b.priority] ?? 2;
        return pa !== pb ? pa - pb : a.createdAt.getTime() - b.createdAt.getTime();
      });
    },
    async listTimedOut() {
      const now = new Date();
      return (await db.select().from(schema.tasks)).map(rowToTask).filter(
        (t) => t.timeoutAt !== null && t.timeoutAt <= now &&
          ['pending', 'assigned', 'running', 'awaiting_approval'].includes(t.status),
      );
    },
    async listByStatus(status: Task['status']) {
      return (await db.select().from(schema.tasks).where(eq(schema.tasks.status, status))).map(rowToTask);
    },
    async listByExecutionRun(runId: string) {
      return (await db.select().from(schema.tasks).where(eq(schema.tasks.executionRunId, runId))).map(rowToTask);
    },
    async listDeadLetter() {
      return (await db.select().from(schema.tasks).where(eq(schema.tasks.status, 'dead_letter')))
        .map(rowToTask).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    },
    async update(id: string, input: UpdateTaskInput) {
      const now = new Date();
      const updates: Partial<typeof schema.tasks.$inferInsert> = { updatedAt: now };
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.status !== undefined) updates.status = input.status;
      if (input.requiredCapabilities !== undefined) updates.requiredCapabilities = input.requiredCapabilities;
      if (input.assigneeAgentId !== undefined) updates.assigneeAgentId = input.assigneeAgentId;
      if (input.workflowId !== undefined) updates.workflowId = input.workflowId;
      if (input.executionRunId !== undefined) updates.executionRunId = input.executionRunId;
      if (input.stepId !== undefined) updates.stepId = input.stepId;
      if (input.dependencies !== undefined) updates.dependencies = input.dependencies;
      if (input.input !== undefined) updates.input = input.input;
      if (input.output !== undefined) updates.output = input.output;
      if (input.errorMessage !== undefined) updates.errorMessage = input.errorMessage;
      if (input.maxRetries !== undefined) updates.maxRetries = input.maxRetries;
      if (input.retryCount !== undefined) updates.retryCount = input.retryCount;
      if (input.retryDelay !== undefined) updates.retryDelay = input.retryDelay;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.timeoutAt !== undefined) updates.timeoutAt = input.timeoutAt;
      await db.update(schema.tasks).set(updates).where(eq(schema.tasks.id, id));
      return tasks.getById(id);
    },
    async delete(id: string) {
      const r = await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
      return (r as unknown as { count: number }).count > 0;
    },
    async requeueForRetry(id: string, errorMessage: string) {
      const task = await tasks.getById(id);
      if (!task) return null;
      const nextRetryCount = task.retryCount + 1;
      return tasks.update(id, {
        status: nextRetryCount > task.maxRetries ? 'dead_letter' : 'pending',
        retryCount: nextRetryCount, assigneeAgentId: null, errorMessage,
      });
    },
  };

  const workflows: WorkflowRepository = {
    async create(input: CreateWorkflowInput): Promise<Workflow> {
      const now = new Date();
      await db.insert(schema.workflows).values({
        id: input.id, name: input.name, steps: input.steps as unknown[],
        status: input.status, createdAt: now, updatedAt: now,
      });
      return (await workflows.getById(input.id))!;
    },
    async getById(id: string) {
      const rows = await db.select().from(schema.workflows).where(eq(schema.workflows.id, id));
      return rows[0] ? rowToWorkflow(rows[0]) : null;
    },
    async list() {
      return (await db.select().from(schema.workflows)).map(rowToWorkflow);
    },
    async update(id: string, input: UpdateWorkflowInput) {
      const now = new Date();
      const updates: Partial<typeof schema.workflows.$inferInsert> = { updatedAt: now };
      if (input.name !== undefined) updates.name = input.name;
      if (input.steps !== undefined) updates.steps = input.steps as unknown[];
      if (input.status !== undefined) updates.status = input.status;
      await db.update(schema.workflows).set(updates).where(eq(schema.workflows.id, id));
      return workflows.getById(id);
    },
    async delete(id: string) {
      const r = await db.delete(schema.workflows).where(eq(schema.workflows.id, id));
      return (r as unknown as { count: number }).count > 0;
    },
  };

  const executionRuns: ExecutionRunRepository = {
    async create(input: CreateExecutionRunInput): Promise<ExecutionRun> {
      const now = new Date();
      await db.insert(schema.executionRuns).values({
        id: input.id, workflowId: input.workflowId,
        parentRunId: input.parentRunId ?? null,
        parentStepId: input.parentStepId ?? null,
        status: input.status,
        startedAt: input.startedAt ?? null,
        completedAt: input.completedAt ?? null,
        cancelledAt: input.cancelledAt ?? null,
        timeoutAt: input.timeoutAt ?? null,
        stepResults: input.stepResults as unknown[],
        createdAt: now, updatedAt: now,
      });
      return (await executionRuns.getById(input.id))!;
    },
    async getById(id: string) {
      const rows = await db.select().from(schema.executionRuns).where(eq(schema.executionRuns.id, id));
      return rows[0] ? rowToRun(rows[0]) : null;
    },
    async list() {
      return (await db.select().from(schema.executionRuns)).map(rowToRun);
    },
    async update(id: string, input: UpdateExecutionRunInput) {
      const now = new Date();
      const updates: Partial<typeof schema.executionRuns.$inferInsert> = { updatedAt: now };
      if (input.status !== undefined) updates.status = input.status;
      if (input.startedAt !== undefined) updates.startedAt = input.startedAt;
      if (input.completedAt !== undefined) updates.completedAt = input.completedAt;
      if (input.cancelledAt !== undefined) updates.cancelledAt = input.cancelledAt;
      if (input.stepResults !== undefined) updates.stepResults = input.stepResults as unknown[];
      await db.update(schema.executionRuns).set(updates).where(eq(schema.executionRuns.id, id));
      return executionRuns.getById(id);
    },
    async delete(id: string) {
      const r = await db.delete(schema.executionRuns).where(eq(schema.executionRuns.id, id));
      return (r as unknown as { count: number }).count > 0;
    },
    async listTimedOut() {
      const now = new Date();
      return (await db.select().from(schema.executionRuns)).map(rowToRun).filter(
        (r) => r.timeoutAt !== null && r.timeoutAt <= now && ['pending', 'running'].includes(r.status),
      );
    },
  };

  const events: EventRepository = {
    async create(input: CreateEventInput): Promise<Event> {
      await db.insert(schema.events).values({
        id: input.id, type: input.type, source: input.source,
        payload: input.payload, timestamp: input.timestamp,
        createdAt: new Date(),
      });
      return (await events.getById(input.id))!;
    },
    async getById(id: string) {
      const rows = await db.select().from(schema.events).where(eq(schema.events.id, id));
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id, type: row.type, source: row.source,
        payload: row.payload as Record<string, unknown>,
        timestamp: row.timestamp, createdAt: row.createdAt,
      };
    },
    async list() {
      return (await db.select().from(schema.events)).map((row) => ({
        id: row.id, type: row.type, source: row.source,
        payload: row.payload as Record<string, unknown>,
        timestamp: row.timestamp, createdAt: row.createdAt,
      }));
    },
  };

  const apiKeys: ApiKeyRepository = {
    async create(input: CreateApiKeyInput): Promise<ApiKey> {
      await db.insert(schema.apiKeys).values({
        id: input.id, name: input.name, hashedKey: input.hashedKey,
        agentId: input.agentId ?? null, role: input.role,
        createdAt: input.createdAt ?? new Date(),
        expiresAt: input.expiresAt ?? null,
        revokedAt: input.revokedAt ?? null,
      });
      return (await apiKeys.getById(input.id))!;
    },
    async getByPlaintext(plaintext: string) {
      const hashed = createHash('sha256').update(plaintext).digest('hex');
      const rows = await db.select().from(schema.apiKeys)
        .where(eq(schema.apiKeys.hashedKey, hashed));
      return rows[0] ? rowToApiKey(rows[0]) : null;
    },
    async getById(id: string) {
      const rows = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, id));
      return rows[0] ? rowToApiKey(rows[0]) : null;
    },
    async list() {
      return (await db.select().from(schema.apiKeys)).map(rowToApiKey);
    },
    async revoke(id: string) {
      const now = new Date();
      await db.update(schema.apiKeys).set({ revokedAt: now }).where(eq(schema.apiKeys.id, id));
      return apiKeys.getById(id);
    },
  };

  const auditLog: AuditLogRepository = {
    async create(input: CreateAuditLogInput): Promise<AuditLogEntry> {
      const id = input.id ?? randomUUID();
      await db.insert(schema.auditLog).values({
        id, actorId: input.actorId ?? null, actorType: input.actorType,
        action: input.action, resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        metadata: input.metadata ?? {}, timestamp: input.timestamp,
      });
      const rows = await db.select().from(schema.auditLog).where(eq(schema.auditLog.id, id));
      const row = rows[0]!;
      return {
        id: row.id, actorId: row.actorId, actorType: row.actorType as AuditLogEntry['actorType'],
        action: row.action, resourceType: row.resourceType, resourceId: row.resourceId,
        metadata: row.metadata as Record<string, unknown>, timestamp: row.timestamp,
      };
    },
    async list(filter: AuditLogFilter = {}) {
      const conditions = [];
      if (filter.actorId) conditions.push(eq(schema.auditLog.actorId, filter.actorId));
      if (filter.resourceType) conditions.push(eq(schema.auditLog.resourceType, filter.resourceType));
      if (filter.resourceId) conditions.push(eq(schema.auditLog.resourceId, filter.resourceId));
      if (filter.from) conditions.push(gte(schema.auditLog.timestamp, filter.from));
      if (filter.to) conditions.push(lte(schema.auditLog.timestamp, filter.to));
      let q = db.select().from(schema.auditLog);
      if (conditions.length > 0) q = q.where(and(...conditions)) as typeof q;
      const rows = await q.orderBy(sql`${schema.auditLog.timestamp} DESC`);
      const limited = filter.limit ? rows.slice(filter.offset ?? 0, (filter.offset ?? 0) + filter.limit) : rows;
      return limited.map((row) => ({
        id: row.id, actorId: row.actorId, actorType: row.actorType as AuditLogEntry['actorType'],
        action: row.action, resourceType: row.resourceType, resourceId: row.resourceId,
        metadata: row.metadata as Record<string, unknown>, timestamp: row.timestamp,
      }));
    },
  };

  const webhooks: WebhookRepository = {
    async create(input: CreateWebhookInput): Promise<Webhook> {
      const now = new Date();
      await db.insert(schema.webhooks).values({
        id: input.id, url: input.url, events: input.events,
        secret: input.secret, active: input.active, createdAt: now, updatedAt: now,
      });
      return (await webhooks.getById(input.id))!;
    },
    async getById(id: string) {
      const rows = await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, id));
      return rows[0] ? rowToWebhook(rows[0]) : null;
    },
    async list() {
      return (await db.select().from(schema.webhooks)).map(rowToWebhook);
    },
    async update(id: string, input: UpdateWebhookInput) {
      const now = new Date();
      const updates: Partial<typeof schema.webhooks.$inferInsert> = { updatedAt: now };
      if (input.url !== undefined) updates.url = input.url;
      if (input.events !== undefined) updates.events = input.events;
      if (input.secret !== undefined) updates.secret = input.secret;
      if (input.active !== undefined) updates.active = input.active;
      await db.update(schema.webhooks).set(updates).where(eq(schema.webhooks.id, id));
      return webhooks.getById(id);
    },
    async delete(id: string) {
      const r = await db.delete(schema.webhooks).where(eq(schema.webhooks.id, id));
      return (r as unknown as { count: number }).count > 0;
    },
    async listActiveForEvent(eventType: string) {
      return (await db.select().from(schema.webhooks).where(eq(schema.webhooks.active, true)))
        .map(rowToWebhook)
        .filter((w) => w.events.some((e) => e === '*' || e === eventType || eventType.startsWith(e.replace('*', ''))));
    },
  };

  const alerts: AlertRepository = {
    async createRule(input: CreateAlertRuleInput): Promise<AlertRule> {
      const now = new Date();
      await db.insert(schema.alertRules).values({
        id: input.id, name: input.name, metric: input.metric,
        operator: input.operator, threshold: input.threshold,
        webhookUrl: input.webhookUrl, active: input.active ?? true,
        createdAt: now, updatedAt: now,
      });
      return (await alerts.getRuleById(input.id))!;
    },
    async getRuleById(id: string) {
      const rows = await db.select().from(schema.alertRules).where(eq(schema.alertRules.id, id));
      const row = rows[0];
      if (!row) return null;
      return { id: row.id, name: row.name, metric: row.metric as AlertRule['metric'],
        operator: row.operator as AlertRule['operator'], threshold: row.threshold,
        webhookUrl: row.webhookUrl, active: row.active,
        createdAt: row.createdAt, updatedAt: row.updatedAt };
    },
    async listRules() {
      return (await db.select().from(schema.alertRules)).map((row) => ({
        id: row.id, name: row.name, metric: row.metric as AlertRule['metric'],
        operator: row.operator as AlertRule['operator'], threshold: row.threshold,
        webhookUrl: row.webhookUrl, active: row.active,
        createdAt: row.createdAt, updatedAt: row.updatedAt,
      }));
    },
    async updateRule(id: string, input: UpdateAlertRuleInput) {
      const now = new Date();
      const updates: Partial<typeof schema.alertRules.$inferInsert> = { updatedAt: now };
      if (input.name !== undefined) updates.name = input.name;
      if (input.metric !== undefined) updates.metric = input.metric;
      if (input.operator !== undefined) updates.operator = input.operator;
      if (input.threshold !== undefined) updates.threshold = input.threshold;
      if (input.webhookUrl !== undefined) updates.webhookUrl = input.webhookUrl;
      if (input.active !== undefined) updates.active = input.active;
      await db.update(schema.alertRules).set(updates).where(eq(schema.alertRules.id, id));
      return alerts.getRuleById(id);
    },
    async deleteRule(id: string) {
      const r = await db.delete(schema.alertRules).where(eq(schema.alertRules.id, id));
      return (r as unknown as { count: number }).count > 0;
    },
    async getState(ruleId: string) {
      const rows = await db.select().from(schema.alertStates).where(eq(schema.alertStates.ruleId, ruleId));
      const row = rows[0];
      if (!row) return null;
      return { ruleId: row.ruleId, status: row.status as AlertStatus, lastValue: row.lastValue,
        firedAt: row.firedAt ?? null, resolvedAt: row.resolvedAt ?? null, updatedAt: row.updatedAt };
    },
    async listStates() {
      return (await db.select().from(schema.alertStates)).map((row) => ({
        ruleId: row.ruleId, status: row.status as AlertStatus, lastValue: row.lastValue,
        firedAt: row.firedAt ?? null, resolvedAt: row.resolvedAt ?? null, updatedAt: row.updatedAt,
      }));
    },
    async upsertState(ruleId: string, status: AlertStatus, lastValue: number) {
      const now = new Date();
      const existing = await alerts.getState(ruleId);
      const firedAt = status === 'firing' ? (existing?.firedAt ?? now) : null;
      const resolvedAt = status === 'ok' && existing?.status === 'firing' ? now : null;
      await db.insert(schema.alertStates)
        .values({ ruleId, status, lastValue, firedAt, resolvedAt, updatedAt: now })
        .onConflictDoUpdate({
          target: schema.alertStates.ruleId,
          set: { status, lastValue, firedAt, resolvedAt, updatedAt: now },
        });
      return (await alerts.getState(ruleId))!;
    },
  };

  return { agents, tasks, workflows, executionRuns, events, apiKeys, auditLog, webhooks, alerts };
}
