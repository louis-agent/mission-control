// Core domain logic for AI mission control

export const VERSION = '0.1.0';

// Types
export type {
  AgentStatus,
  TaskStatus,
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
} from './types.js';

// Schema
export * from './schema.js';

// Database
export { createDb, runMigrations } from './db.js';
export type { DB } from './db.js';

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
  createWorkflow,
  getWorkflowById,
  listWorkflows,
  updateWorkflow,
  deleteWorkflow,
  createExecutionRun,
  getExecutionRunById,
  listExecutionRuns,
  updateExecutionRun,
  deleteExecutionRun,
  createEvent,
  getEventById,
  listEvents,
} from './crud.js';
