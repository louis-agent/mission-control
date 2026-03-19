/**
 * SQLite repository adapters.
 *
 * Wraps the synchronous crud-*.ts free functions to satisfy the async
 * repository interfaces. Promise.resolve() adds minimal overhead while keeping
 * the contract consistent with the PostgreSQL adapter.
 */

import type { DB } from './db.js';
import {
  createAgent, getAgentById, listAgents, listAgentsByCapability,
  updateAgent, deleteAgent, heartbeatAgent,
} from './crud-agents.js';
import {
  createTask, getTaskById, listTasks, listPendingTasks, listTimedOutTasks,
  listTasksByStatus, listTasksByExecutionRun, listDeadLetterTasks,
  updateTask, deleteTask, requeueTaskForRetry,
} from './crud-tasks.js';
import {
  createWorkflow, getWorkflowById, listWorkflows,
  updateWorkflow, deleteWorkflow,
} from './crud-workflows.js';
import {
  createExecutionRun, getExecutionRunById, listExecutionRuns,
  updateExecutionRun, deleteExecutionRun, listTimedOutRuns,
} from './crud-execution-runs.js';
import { createEvent, getEventById, listEvents } from './crud-events.js';
import {
  createApiKey, getApiKeyByPlaintext, getApiKeyById,
  listApiKeys, revokeApiKey,
} from './crud-api-keys.js';
import { createAuditLogEntry, listAuditLog } from './crud-audit-log.js';
import {
  createWebhook, getWebhookById, listWebhooks, updateWebhook,
  deleteWebhook, listActiveWebhooksForEvent,
} from './crud-webhooks.js';
import {
  createAlertRule, getAlertRuleById, listAlertRules, updateAlertRule,
  deleteAlertRule, getAlertState, listAlertStates, upsertAlertState,
} from './crud-alerts.js';
import type {
  AgentRepository, TaskRepository, WorkflowRepository, ExecutionRunRepository,
  EventRepository, ApiKeyRepository, AuditLogRepository, WebhookRepository,
  AlertRepository, Repositories,
} from './repository.js';
import type { AlertStatus } from './crud-alerts.js';

const p = <T>(v: T) => Promise.resolve(v);

export function createSqliteAgentRepository(db: DB): AgentRepository {
  return {
    create: (input) => p(createAgent(db, input)),
    getById: (id) => p(getAgentById(db, id)),
    list: () => p(listAgents(db)),
    listByCapability: (cap) => p(listAgentsByCapability(db, cap)),
    update: (id, input) => p(updateAgent(db, id, input)),
    delete: (id) => p(deleteAgent(db, id)),
    heartbeat: (id) => p(heartbeatAgent(db, id)),
  };
}

export function createSqliteTaskRepository(db: DB): TaskRepository {
  return {
    create: (input) => p(createTask(db, input)),
    getById: (id) => p(getTaskById(db, id)),
    list: () => p(listTasks(db)),
    listPending: () => p(listPendingTasks(db)),
    listTimedOut: () => p(listTimedOutTasks(db)),
    listByStatus: (status) => p(listTasksByStatus(db, status)),
    listByExecutionRun: (runId) => p(listTasksByExecutionRun(db, runId)),
    listDeadLetter: () => p(listDeadLetterTasks(db)),
    update: (id, input) => p(updateTask(db, id, input)),
    delete: (id) => p(deleteTask(db, id)),
    requeueForRetry: (id, msg) => p(requeueTaskForRetry(db, id, msg)),
  };
}

export function createSqliteWorkflowRepository(db: DB): WorkflowRepository {
  return {
    create: (input) => p(createWorkflow(db, input)),
    getById: (id) => p(getWorkflowById(db, id)),
    list: () => p(listWorkflows(db)),
    update: (id, input) => p(updateWorkflow(db, id, input)),
    delete: (id) => p(deleteWorkflow(db, id)),
  };
}

export function createSqliteExecutionRunRepository(db: DB): ExecutionRunRepository {
  return {
    create: (input) => p(createExecutionRun(db, input)),
    getById: (id) => p(getExecutionRunById(db, id)),
    list: () => p(listExecutionRuns(db)),
    update: (id, input) => p(updateExecutionRun(db, id, input)),
    delete: (id) => p(deleteExecutionRun(db, id)),
    listTimedOut: () => p(listTimedOutRuns(db)),
  };
}

export function createSqliteEventRepository(db: DB): EventRepository {
  return {
    create: (input) => p(createEvent(db, input)),
    getById: (id) => p(getEventById(db, id)),
    list: () => p(listEvents(db)),
  };
}

export function createSqliteApiKeyRepository(db: DB): ApiKeyRepository {
  return {
    create: (input) => p(createApiKey(db, input)),
    getByPlaintext: (pt) => p(getApiKeyByPlaintext(db, pt)),
    getById: (id) => p(getApiKeyById(db, id)),
    list: () => p(listApiKeys(db)),
    revoke: (id) => p(revokeApiKey(db, id)),
  };
}

export function createSqliteAuditLogRepository(db: DB): AuditLogRepository {
  return {
    create: (input) => p(createAuditLogEntry(db, input)),
    list: (filter) => p(listAuditLog(db, filter)),
  };
}

export function createSqliteWebhookRepository(db: DB): WebhookRepository {
  return {
    create: (input) => p(createWebhook(db, input)),
    getById: (id) => p(getWebhookById(db, id)),
    list: () => p(listWebhooks(db)),
    update: (id, input) => p(updateWebhook(db, id, input)),
    delete: (id) => p(deleteWebhook(db, id)),
    listActiveForEvent: (evt) => p(listActiveWebhooksForEvent(db, evt)),
  };
}

export function createSqliteAlertRepository(db: DB): AlertRepository {
  return {
    createRule: (input) => p(createAlertRule(db, input)),
    getRuleById: (id) => p(getAlertRuleById(db, id)),
    listRules: () => p(listAlertRules(db)),
    updateRule: (id, input) => p(updateAlertRule(db, id, input)),
    deleteRule: (id) => p(deleteAlertRule(db, id)),
    getState: (ruleId) => p(getAlertState(db, ruleId)),
    listStates: () => p(listAlertStates(db)),
    upsertState: (ruleId, status: AlertStatus, lastValue) =>
      p(upsertAlertState(db, ruleId, status, lastValue)),
  };
}

/** Create all SQLite repositories from a single DB instance. */
export function createSqliteRepositories(db: DB): Repositories {
  return {
    agents: createSqliteAgentRepository(db),
    tasks: createSqliteTaskRepository(db),
    workflows: createSqliteWorkflowRepository(db),
    executionRuns: createSqliteExecutionRunRepository(db),
    events: createSqliteEventRepository(db),
    apiKeys: createSqliteApiKeyRepository(db),
    auditLog: createSqliteAuditLogRepository(db),
    webhooks: createSqliteWebhookRepository(db),
    alerts: createSqliteAlertRepository(db),
  };
}
