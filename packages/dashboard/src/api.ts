const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export interface Agent { id: string; name: string; status: string; capabilities: string[]; lastHeartbeatAt: string | null; }
export interface Task { id: string; title: string; status: string; priority: string; assigneeAgentId: string | null; createdAt: string; }
export interface Workflow { id: string; name: string; status: string; createdAt: string; }
export interface ExecutionRun { id: string; workflowId: string; status: string; startedAt: string | null; completedAt: string | null; }
export interface DashboardMetrics {
  agentUtilization: { total: number; idle: number; busy: number; offline: number };
  taskThroughput: { lastHour: number; lastDay: number };
  failureRate: number;
  queueDepth: number;
  activeWorkflows: number;
  activeExecutionRuns: number;
  timeSeries: { completedTasks: Array<{ timestamp: string; count: number }> };
}

export const api = {
  agents: { list: () => get<Agent[]>('/agents') },
  tasks: { list: () => get<Task[]>('/tasks') },
  workflows: {
    list: () => get<Workflow[]>('/workflows'),
    execute: (id: string) => fetch(`${BASE}/workflows/${id}/execute`, { method: 'POST' }).then(r => r.json()),
  },
  runs: { list: () => get<ExecutionRun[]>('/execution-runs') },
  dashboard: { metrics: () => get<DashboardMetrics>('/dashboard') },
};
