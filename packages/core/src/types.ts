// Inferred types from schema
export type AgentStatus = 'idle' | 'busy' | 'offline';
export type TaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled' | 'dead_letter' | 'awaiting_approval';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ExecutionRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Agent {
  id: string;
  name: string;
  capabilities: string[];
  status: AgentStatus;
  metadata: Record<string, unknown>;
  lastHeartbeatAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  requiredCapabilities: string[];
  assigneeAgentId: string | null;
  workflowId: string | null;
  executionRunId: string | null;
  stepId: string | null;
  dependencies: string[];
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  errorMessage: string | null;
  maxRetries: number;
  retryCount: number;
  retryDelay: number;
  timeoutAt: Date | null;
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
  dependsOn?: string[];
  requiredCapabilities?: string[];
  condition?: string;           // expression evaluated against previous step outputs; skip if false
  subworkflowId?: string;       // for type === 'subworkflow': reference to another workflow
  timeoutMs?: number;           // per-step timeout in milliseconds
  approvalTimeoutHours?: number; // for type === 'approval': auto-reject timeout
}

export interface ExecutionRun {
  id: string;
  workflowId: string;
  parentRunId: string | null;
  parentStepId: string | null;
  status: ExecutionRunStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  timeoutAt: Date | null;
  stepResults: StepResult[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StepResult {
  stepId: string;
  status: 'success' | 'failure' | 'skipped' | 'pending_approval';
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

export type ApiKeyRole = 'admin' | 'operator' | 'agent' | 'viewer';
export type AuditActorType = 'user' | 'agent' | 'system';

export interface ApiKey {
  id: string;
  name: string;
  hashedKey: string;
  agentId: string | null;
  role: ApiKeyRole;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorType: AuditActorType;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export type CreateApiKeyInput = Omit<ApiKey, 'createdAt'> & { createdAt?: Date };
export type CreateAuditLogInput = Omit<AuditLogEntry, 'id'> & { id?: string };

// Input types for create/update operations
export type CreateAgentInput = Omit<Agent, 'createdAt' | 'updatedAt' | 'lastHeartbeatAt'>;
export type UpdateAgentInput = Partial<Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>>;

export type CreateTaskInput = Omit<Task, 'createdAt' | 'updatedAt' | 'executionRunId' | 'stepId' | 'maxRetries' | 'retryCount' | 'retryDelay' | 'timeoutAt'> & {
  executionRunId?: string | null;
  stepId?: string | null;
  maxRetries?: number;
  retryCount?: number;
  retryDelay?: number;
  timeoutAt?: Date | null;
};
export type UpdateTaskInput = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>;

export type CreateWorkflowInput = Omit<Workflow, 'createdAt' | 'updatedAt'>;
export type UpdateWorkflowInput = Partial<Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>>;

export type CreateExecutionRunInput = Omit<ExecutionRun, 'createdAt' | 'updatedAt' | 'cancelledAt' | 'timeoutAt' | 'parentRunId' | 'parentStepId'> & {
  cancelledAt?: Date | null;
  timeoutAt?: Date | null;
  parentRunId?: string | null;
  parentStepId?: string | null;
};
export type UpdateExecutionRunInput = Partial<Omit<ExecutionRun, 'id' | 'createdAt' | 'updatedAt'>>;

export type CreateEventInput = Omit<Event, 'createdAt'>;

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateWebhookInput = Omit<Webhook, 'createdAt' | 'updatedAt'>;
export type UpdateWebhookInput = Partial<Omit<Webhook, 'id' | 'createdAt' | 'updatedAt'>>;
