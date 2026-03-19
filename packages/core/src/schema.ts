import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Agent: represents an autonomous agent in the system
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  capabilities: text('capabilities').notNull().default('[]'), // JSON array
  status: text('status', { enum: ['idle', 'busy', 'offline'] }).notNull().default('idle'),
  metadata: text('metadata').notNull().default('{}'), // JSON object
  lastHeartbeatAt: integer('last_heartbeat_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Workflow: a named sequence of steps
export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  steps: text('steps').notNull().default('[]'), // JSON array
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] }).notNull().default('pending'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Task: a unit of work that can be assigned to an agent
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status', { enum: ['pending', 'assigned', 'running', 'completed', 'failed', 'cancelled', 'dead_letter', 'awaiting_approval'] }).notNull().default('pending'),
  priority: text('priority', { enum: ['critical', 'high', 'medium', 'low'] }).notNull().default('medium'),
  requiredCapabilities: text('required_capabilities').notNull().default('[]'), // JSON array
  assigneeAgentId: text('assignee_agent_id'),
  workflowId: text('workflow_id'),
  executionRunId: text('execution_run_id'),
  stepId: text('step_id'),
  dependencies: text('dependencies').notNull().default('[]'), // JSON array of task IDs
  input: text('input').notNull().default('{}'), // JSON object
  output: text('output').notNull().default('{}'), // JSON object
  errorMessage: text('error_message'),
  maxRetries: integer('max_retries').notNull().default(0),
  retryCount: integer('retry_count').notNull().default(0),
  retryDelay: integer('retry_delay').notNull().default(1000), // base delay in ms
  timeoutAt: integer('timeout_at', { mode: 'timestamp' }), // per-step timeout deadline
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ExecutionRun: a recorded execution of a workflow
export const executionRuns = sqliteTable('execution_runs', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  parentRunId: text('parent_run_id'), // set for sub-workflow runs
  parentStepId: text('parent_step_id'), // the step in the parent run that spawned this
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] }).notNull().default('pending'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),
  timeoutAt: integer('timeout_at', { mode: 'timestamp' }), // per-workflow timeout deadline
  stepResults: text('step_results').notNull().default('[]'), // JSON array
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Event: a system event emitted by agents or workflows
export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  source: text('source').notNull(),
  payload: text('payload').notNull().default('{}'), // JSON object
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ApiKey: access credential with role for auth
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  hashedKey: text('hashed_key').notNull().unique(),
  agentId: text('agent_id'),
  role: text('role', { enum: ['admin', 'operator', 'agent', 'viewer'] }).notNull().default('viewer'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
});

// AuditLog: immutable record of state-changing operations
export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  actorId: text('actor_id'),
  actorType: text('actor_type', { enum: ['user', 'agent', 'system'] }).notNull(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  metadata: text('metadata').notNull().default('{}'), // JSON object
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
});

// Webhook: registered HTTP endpoint for event delivery
export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  events: text('events').notNull().default('[]'), // JSON array of event type patterns
  secret: text('secret').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
