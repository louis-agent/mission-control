// Core domain logic for AI mission control

export const VERSION = '0.1.0';

// Types
export type {
  AgentStatus,
  TaskStatus,
  TaskPriority,
  WorkflowStatus,
  ExecutionRunStatus,
  Agent,
  Task,
  Workflow,
  WorkflowStep,
  ExecutionRun,
  StepResult,
  Event,
  CreateAgentInput,
  UpdateAgentInput,
  CreateTaskInput,
  UpdateTaskInput,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  CreateExecutionRunInput,
  UpdateExecutionRunInput,
  CreateEventInput,
  ApiKey,
  ApiKeyRole,
  AuditLogEntry,
  AuditActorType,
  CreateApiKeyInput,
  CreateAuditLogInput,
  Webhook,
  CreateWebhookInput,
  UpdateWebhookInput,
} from './types.js';

// Schema
export * from './schema.js';

// Database
export { createDb, runMigrations } from './db.js';
export type { DB } from './db.js';

// Event bus
export { EventBus } from './event-bus.js';
export type { EventHandler, Unsubscribe, PublishInput } from './event-bus.js';

// CRUD
export {
  createAgent,
  getAgentById,
  listAgents,
  updateAgent,
  deleteAgent,
  listAgentsByCapability,
  heartbeatAgent,
  createTask,
  getTaskById,
  listTasks,
  updateTask,
  deleteTask,
  listPendingTasks,
  listTasksByStatus,
  listTasksByExecutionRun,
  listDeadLetterTasks,
  listTimedOutTasks,
  requeueTaskForRetry,
  createWorkflow,
  getWorkflowById,
  listWorkflows,
  updateWorkflow,
  deleteWorkflow,
  createExecutionRun,
  getExecutionRunById,
  listExecutionRuns,
  listTimedOutRuns,
  updateExecutionRun,
  deleteExecutionRun,
  createEvent,
  getEventById,
  listEvents,
  // API keys
  generateApiKey,
  createApiKey,
  getApiKeyByPlaintext,
  getApiKeyById,
  listApiKeys,
  revokeApiKey,
  // Audit log
  createAuditLogEntry,
  listAuditLog,
  // Workflow engine
  validateWorkflow,
  startExecution,
  advanceExecution,
  cancelExecution,
  approveStep,
  rejectStep,
  InvalidTransitionError,
  // Webhooks
  createWebhook,
  getWebhookById,
  listWebhooks,
  updateWebhook,
  deleteWebhook,
  listActiveWebhooksForEvent,
  // Alerts
  createAlertRule,
  getAlertRuleById,
  listAlertRules,
  updateAlertRule,
  deleteAlertRule,
  getAlertState,
  listAlertStates,
  upsertAlertState,
} from './crud.js';

export type { AuditLogFilter } from './crud-audit-log.js';
export type {
  AlertMetric,
  AlertOperator,
  AlertStatus,
  AlertRule,
  AlertState,
  CreateAlertRuleInput,
  UpdateAlertRuleInput,
} from './crud-alerts.js';
