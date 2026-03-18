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
  status: text('status', { enum: ['pending', 'assigned', 'running', 'completed', 'failed', 'cancelled'] }).notNull().default('pending'),
  requiredCapabilities: text('required_capabilities').notNull().default('[]'), // JSON array
  assigneeAgentId: text('assignee_agent_id'),
  workflowId: text('workflow_id'),
  executionRunId: text('execution_run_id'),
  stepId: text('step_id'),
  dependencies: text('dependencies').notNull().default('[]'), // JSON array of task IDs
  input: text('input').notNull().default('{}'), // JSON object
  output: text('output').notNull().default('{}'), // JSON object
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ExecutionRun: a recorded execution of a workflow
export const executionRuns = sqliteTable('execution_runs', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] }).notNull().default('pending'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),
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
