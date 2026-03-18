// Inferred types from schema
export type AgentStatus = 'idle' | 'busy' | 'offline';
export type TaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'failed';
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ExecutionRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Agent {
  id: string;
  name: string;
  capabilities: string[];
  status: AgentStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeAgentId: string | null;
  workflowId: string | null;
  dependencies: string[];
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  status: WorkflowStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
}

export interface ExecutionRun {
  id: string;
  workflowId: string;
  status: ExecutionRunStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  stepResults: StepResult[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StepResult {
  stepId: string;
  status: 'success' | 'failure' | 'skipped';
  output: Record<string, unknown>;
  error?: string;
}

export interface Event {
  id: string;
  type: string;
  source: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  createdAt: Date;
}

// Input types for create/update operations
export type CreateAgentInput = Omit<Agent, 'createdAt' | 'updatedAt'>;
export type UpdateAgentInput = Partial<Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>>;

export type CreateTaskInput = Omit<Task, 'createdAt' | 'updatedAt'>;
export type UpdateTaskInput = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>;

export type CreateWorkflowInput = Omit<Workflow, 'createdAt' | 'updatedAt'>;
export type UpdateWorkflowInput = Partial<Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>>;

export type CreateExecutionRunInput = Omit<ExecutionRun, 'createdAt' | 'updatedAt'>;
export type UpdateExecutionRunInput = Partial<Omit<ExecutionRun, 'id' | 'createdAt' | 'updatedAt'>>;

export type CreateEventInput = Omit<Event, 'createdAt'>;
