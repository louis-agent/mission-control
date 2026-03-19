/**
 * PostgreSQL Drizzle schema.
 *
 * Mirrors schema.ts but uses pgTable, text/jsonb/timestamp column types.
 * Used exclusively by repository-postgres.ts.
 */

import {
  pgTable, text, timestamp, integer, boolean, jsonb,
} from 'drizzle-orm/pg-core';

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  capabilities: jsonb('capabilities').notNull().$type<string[]>().default([]),
  status: text('status', { enum: ['idle', 'busy', 'offline'] }).notNull().default('idle'),
  metadata: jsonb('metadata').notNull().$type<Record<string, unknown>>().default({}),
  lastHeartbeatAt: timestamp('last_heartbeat_at'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const workflows = pgTable('workflows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  steps: jsonb('steps').notNull().$type<unknown[]>().default([]),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] }).notNull().default('pending'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status', {
    enum: ['pending', 'assigned', 'running', 'completed', 'failed', 'cancelled', 'dead_letter', 'awaiting_approval'],
  }).notNull().default('pending'),
  priority: text('priority', { enum: ['critical', 'high', 'medium', 'low'] }).notNull().default('medium'),
  requiredCapabilities: jsonb('required_capabilities').notNull().$type<string[]>().default([]),
  assigneeAgentId: text('assignee_agent_id'),
  workflowId: text('workflow_id'),
  executionRunId: text('execution_run_id'),
  stepId: text('step_id'),
  dependencies: jsonb('dependencies').notNull().$type<string[]>().default([]),
  input: jsonb('input').notNull().$type<Record<string, unknown>>().default({}),
  output: jsonb('output').notNull().$type<Record<string, unknown>>().default({}),
  errorMessage: text('error_message'),
  maxRetries: integer('max_retries').notNull().default(0),
  retryCount: integer('retry_count').notNull().default(0),
  retryDelay: integer('retry_delay').notNull().default(1000),
  timeoutAt: timestamp('timeout_at'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const executionRuns = pgTable('execution_runs', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  parentRunId: text('parent_run_id'),
  parentStepId: text('parent_step_id'),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] }).notNull().default('pending'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  cancelledAt: timestamp('cancelled_at'),
  timeoutAt: timestamp('timeout_at'),
  stepResults: jsonb('step_results').notNull().$type<unknown[]>().default([]),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  source: text('source').notNull(),
  payload: jsonb('payload').notNull().$type<Record<string, unknown>>().default({}),
  timestamp: timestamp('timestamp').notNull(),
  createdAt: timestamp('created_at').notNull(),
});

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  hashedKey: text('hashed_key').notNull().unique(),
  agentId: text('agent_id'),
  role: text('role', { enum: ['admin', 'operator', 'agent', 'viewer'] }).notNull().default('viewer'),
  createdAt: timestamp('created_at').notNull(),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
});

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  actorId: text('actor_id'),
  actorType: text('actor_type', { enum: ['user', 'agent', 'system'] }).notNull(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata').notNull().$type<Record<string, unknown>>().default({}),
  timestamp: timestamp('timestamp').notNull(),
});

export const webhooks = pgTable('webhooks', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  events: jsonb('events').notNull().$type<string[]>().default([]),
  secret: text('secret').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const alertRules = pgTable('alert_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  metric: text('metric').notNull(),
  operator: text('operator', { enum: ['gt', 'gte', 'lt', 'lte'] }).notNull(),
  threshold: integer('threshold').notNull(),
  webhookUrl: text('webhook_url').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const alertStates = pgTable('alert_states', {
  ruleId: text('rule_id').primaryKey(),
  status: text('status', { enum: ['ok', 'firing'] }).notNull().default('ok'),
  lastValue: integer('last_value').notNull().default(0),
  firedAt: timestamp('fired_at'),
  resolvedAt: timestamp('resolved_at'),
  updatedAt: timestamp('updated_at').notNull(),
});
