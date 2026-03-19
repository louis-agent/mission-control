/**
 * Repository interfaces for all Mission Control entities.
 *
 * Methods return Promises to allow both synchronous (SQLite via Promise.resolve)
 * and genuinely asynchronous (PostgreSQL) adapters to satisfy the same contract.
 *
 * Consumers should migrate away from the synchronous crud-*.ts helpers and
 * program to these interfaces so that the backing database can be swapped at
 * startup via the DATABASE_URL environment variable.
 */

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

// ── Agent ─────────────────────────────────────────────────────────────────────

export interface AgentRepository {
  create(input: CreateAgentInput): Promise<Agent>;
  getById(id: string): Promise<Agent | null>;
  list(): Promise<Agent[]>;
  listByCapability(capability: string): Promise<Agent[]>;
  update(id: string, input: UpdateAgentInput): Promise<Agent | null>;
  delete(id: string): Promise<boolean>;
  heartbeat(id: string): Promise<Agent | null>;
}

// ── Task ──────────────────────────────────────────────────────────────────────

export interface TaskRepository {
  create(input: CreateTaskInput): Promise<Task>;
  getById(id: string): Promise<Task | null>;
  list(): Promise<Task[]>;
  listPending(): Promise<Task[]>;
  listTimedOut(): Promise<Task[]>;
  listByStatus(status: Task['status']): Promise<Task[]>;
  listByExecutionRun(runId: string): Promise<Task[]>;
  listDeadLetter(): Promise<Task[]>;
  update(id: string, input: UpdateTaskInput): Promise<Task | null>;
  delete(id: string): Promise<boolean>;
  requeueForRetry(id: string, errorMessage: string): Promise<Task | null>;
}

// ── Workflow ──────────────────────────────────────────────────────────────────

export interface WorkflowRepository {
  create(input: CreateWorkflowInput): Promise<Workflow>;
  getById(id: string): Promise<Workflow | null>;
  list(): Promise<Workflow[]>;
  update(id: string, input: UpdateWorkflowInput): Promise<Workflow | null>;
  delete(id: string): Promise<boolean>;
}

// ── ExecutionRun ──────────────────────────────────────────────────────────────

export interface ExecutionRunRepository {
  create(input: CreateExecutionRunInput): Promise<ExecutionRun>;
  getById(id: string): Promise<ExecutionRun | null>;
  list(): Promise<ExecutionRun[]>;
  update(id: string, input: UpdateExecutionRunInput): Promise<ExecutionRun | null>;
  delete(id: string): Promise<boolean>;
  listTimedOut(): Promise<ExecutionRun[]>;
}

// ── Event ─────────────────────────────────────────────────────────────────────

export interface EventRepository {
  create(input: CreateEventInput): Promise<Event>;
  getById(id: string): Promise<Event | null>;
  list(): Promise<Event[]>;
}

// ── ApiKey ────────────────────────────────────────────────────────────────────

export interface ApiKeyRepository {
  create(input: CreateApiKeyInput): Promise<ApiKey>;
  getByPlaintext(plaintext: string): Promise<ApiKey | null>;
  getById(id: string): Promise<ApiKey | null>;
  list(): Promise<ApiKey[]>;
  revoke(id: string): Promise<ApiKey | null>;
}

// ── AuditLog ──────────────────────────────────────────────────────────────────

export interface AuditLogRepository {
  create(input: CreateAuditLogInput): Promise<AuditLogEntry>;
  list(filter?: AuditLogFilter): Promise<AuditLogEntry[]>;
}

// ── Webhook ───────────────────────────────────────────────────────────────────

export interface WebhookRepository {
  create(input: CreateWebhookInput): Promise<Webhook>;
  getById(id: string): Promise<Webhook | null>;
  list(): Promise<Webhook[]>;
  update(id: string, input: UpdateWebhookInput): Promise<Webhook | null>;
  delete(id: string): Promise<boolean>;
  listActiveForEvent(eventType: string): Promise<Webhook[]>;
}

// ── AlertRule + AlertState ────────────────────────────────────────────────────

export interface AlertRepository {
  createRule(input: CreateAlertRuleInput): Promise<AlertRule>;
  getRuleById(id: string): Promise<AlertRule | null>;
  listRules(): Promise<AlertRule[]>;
  updateRule(id: string, input: UpdateAlertRuleInput): Promise<AlertRule | null>;
  deleteRule(id: string): Promise<boolean>;
  getState(ruleId: string): Promise<AlertState | null>;
  listStates(): Promise<AlertState[]>;
  upsertState(ruleId: string, status: AlertStatus, lastValue: number): Promise<AlertState>;
}

// ── Combined repositories bundle ──────────────────────────────────────────────

export interface Repositories {
  agents: AgentRepository;
  tasks: TaskRepository;
  workflows: WorkflowRepository;
  executionRuns: ExecutionRunRepository;
  events: EventRepository;
  apiKeys: ApiKeyRepository;
  auditLog: AuditLogRepository;
  webhooks: WebhookRepository;
  alerts: AlertRepository;
}
