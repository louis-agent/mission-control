import { z } from 'zod';

// ── Agent schemas ──────────────────────────────────────────────────────────────

export const CreateAgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  capabilities: z.array(z.string()).optional(),
  status: z.enum(['idle', 'busy', 'offline']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).optional(),
  capabilities: z.array(z.string()).optional(),
  status: z.enum(['idle', 'busy', 'offline']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

// ── Task schemas ───────────────────────────────────────────────────────────────

export const CreateTaskSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  requiredCapabilities: z.array(z.string()).optional(),
  workflowId: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  maxRetries: z.number().int().min(0).optional(),
  retryDelay: z.number().int().min(0).optional(),
});

export const CompleteTaskSchema = z.object({
  output: z.record(z.string(), z.unknown()).optional(),
});

export const FailTaskSchema = z.object({
  error: z.string().optional(),
});

// ── Workflow schemas ───────────────────────────────────────────────────────────

const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  dependsOn: z.array(z.string()).optional(),
  requiredCapabilities: z.array(z.string()).optional(),
  condition: z.string().optional(),
  subworkflowId: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  approvalTimeoutHours: z.number().positive().optional(),
});

export const CreateWorkflowSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  steps: z.array(WorkflowStepSchema).optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
});

// ── Webhook schemas ───────────────────────────────────────────────────────────

export const CreateWebhookSchema = z.object({
  id: z.string().min(1).optional(),
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
  secret: z.string().min(8),
  active: z.boolean().optional(),
});

export const UpdateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string().min(1)).optional(),
  secret: z.string().min(8).optional(),
  active: z.boolean().optional(),
}).strict();

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;
