import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from './db.js';
import type { DB } from './db.js';
import {
  createAgent, getAgentById, listAgents, updateAgent, deleteAgent,
  listAgentsByCapability, heartbeatAgent,
  createTask, getTaskById, listTasks, updateTask, deleteTask,
  createWorkflow, getWorkflowById, listWorkflows, updateWorkflow, deleteWorkflow,
  createExecutionRun, getExecutionRunById, listExecutionRuns, updateExecutionRun, deleteExecutionRun,
  createEvent, getEventById, listEvents,
} from './crud.js';

let db: DB;

beforeEach(() => {
  db = createDb(':memory:');
});

// ──────────────────────────────────────────────────────────────────────────────
// Agent
// ──────────────────────────────────────────────────────────────────────────────

describe('Agent CRUD', () => {
  const agentInput = {
    id: 'agent-1',
    name: 'Test Agent',
    capabilities: ['search', 'write'],
    status: 'idle' as const,
    metadata: { version: '1.0' },
  };

  it('creates an agent and retrieves it by id', () => {
    const agent = createAgent(db, agentInput);
    expect(agent.id).toBe('agent-1');
    expect(agent.name).toBe('Test Agent');
    expect(agent.capabilities).toEqual(['search', 'write']);
    expect(agent.status).toBe('idle');
    expect(agent.metadata).toEqual({ version: '1.0' });
    expect(agent.createdAt).toBeInstanceOf(Date);
    expect(agent.updatedAt).toBeInstanceOf(Date);
  });

  it('returns null for missing agent', () => {
    expect(getAgentById(db, 'nonexistent')).toBeNull();
  });

  it('lists all agents', () => {
    createAgent(db, agentInput);
    createAgent(db, { ...agentInput, id: 'agent-2', name: 'Agent Two' });
    const all = listAgents(db);
    expect(all).toHaveLength(2);
  });

  it('updates an agent', () => {
    createAgent(db, agentInput);
    const updated = updateAgent(db, 'agent-1', { name: 'Updated', status: 'busy' });
    expect(updated?.name).toBe('Updated');
    expect(updated?.status).toBe('busy');
    expect(updated?.capabilities).toEqual(['search', 'write']); // unchanged
  });

  it('returns null when updating nonexistent agent', () => {
    const result = updateAgent(db, 'nonexistent', { name: 'X' });
    expect(result).toBeNull();
  });

  it('deletes an agent', () => {
    createAgent(db, agentInput);
    expect(deleteAgent(db, 'agent-1')).toBe(true);
    expect(getAgentById(db, 'agent-1')).toBeNull();
  });

  it('returns false when deleting nonexistent agent', () => {
    expect(deleteAgent(db, 'nonexistent')).toBe(false);
  });

  it('updates capabilities correctly (JSON roundtrip)', () => {
    createAgent(db, agentInput);
    updateAgent(db, 'agent-1', { capabilities: ['read', 'write', 'execute'] });
    const result = getAgentById(db, 'agent-1');
    expect(result?.capabilities).toEqual(['read', 'write', 'execute']);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Agent registry (capability query + heartbeat)
// ──────────────────────────────────────────────────────────────────────────────

describe('Agent registry', () => {
  const base = {
    id: 'agent-1',
    name: 'Alpha',
    capabilities: ['search', 'write'],
    status: 'idle' as const,
    metadata: {},
  };

  it('agent has null lastHeartbeatAt after creation', () => {
    const agent = createAgent(db, base);
    expect(agent.lastHeartbeatAt).toBeNull();
  });

  it('listAgentsByCapability returns only matching agents', () => {
    createAgent(db, base);
    createAgent(db, { ...base, id: 'agent-2', name: 'Beta', capabilities: ['code-review', 'write'] });
    createAgent(db, { ...base, id: 'agent-3', name: 'Gamma', capabilities: ['read'] });

    const writeAgents = listAgentsByCapability(db, 'write');
    expect(writeAgents).toHaveLength(2);
    expect(writeAgents.map(a => a.id)).toContain('agent-1');
    expect(writeAgents.map(a => a.id)).toContain('agent-2');

    const readAgents = listAgentsByCapability(db, 'read');
    expect(readAgents).toHaveLength(1);
    expect(readAgents[0].id).toBe('agent-3');
  });

  it('listAgentsByCapability returns empty array when no match', () => {
    createAgent(db, base);
    expect(listAgentsByCapability(db, 'nonexistent')).toEqual([]);
  });

  it('heartbeatAgent updates lastHeartbeatAt timestamp', () => {
    createAgent(db, base);
    const before = Date.now();
    const result = heartbeatAgent(db, 'agent-1');
    const after = Date.now();

    expect(result).not.toBeNull();
    expect(result!.lastHeartbeatAt).toBeInstanceOf(Date);
    // SQLite stores timestamps at second precision; allow 1s slack on lower bound
    const ts = result!.lastHeartbeatAt!.getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });

  it('heartbeatAgent returns null for nonexistent agent', () => {
    expect(heartbeatAgent(db, 'nonexistent')).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Task
// ──────────────────────────────────────────────────────────────────────────────

describe('Task CRUD', () => {
  const taskInput = {
    id: 'task-1',
    title: 'Build feature',
    description: 'Implement the new feature',
    status: 'pending' as const,
    requiredCapabilities: [],
    assigneeAgentId: null,
    workflowId: null,
    dependencies: [],
    input: { repo: 'mission-control' },
    output: {},
    errorMessage: null,
  };

  it('creates a task and retrieves it', () => {
    const task = createTask(db, taskInput);
    expect(task.id).toBe('task-1');
    expect(task.title).toBe('Build feature');
    expect(task.status).toBe('pending');
    expect(task.input).toEqual({ repo: 'mission-control' });
    expect(task.dependencies).toEqual([]);
    expect(task.createdAt).toBeInstanceOf(Date);
  });

  it('returns null for missing task', () => {
    expect(getTaskById(db, 'nonexistent')).toBeNull();
  });

  it('lists all tasks', () => {
    createTask(db, taskInput);
    createTask(db, { ...taskInput, id: 'task-2', title: 'Task Two' });
    expect(listTasks(db)).toHaveLength(2);
  });

  it('updates task status and assignee', () => {
    createTask(db, taskInput);
    const updated = updateTask(db, 'task-1', {
      status: 'assigned',
      assigneeAgentId: 'agent-1',
    });
    expect(updated?.status).toBe('assigned');
    expect(updated?.assigneeAgentId).toBe('agent-1');
  });

  it('updates dependencies (JSON roundtrip)', () => {
    createTask(db, taskInput);
    updateTask(db, 'task-1', { dependencies: ['task-0', 'task-prereq'] });
    const result = getTaskById(db, 'task-1');
    expect(result?.dependencies).toEqual(['task-0', 'task-prereq']);
  });

  it('updates output', () => {
    createTask(db, taskInput);
    updateTask(db, 'task-1', { status: 'completed', output: { result: 'success' } });
    const result = getTaskById(db, 'task-1');
    expect(result?.output).toEqual({ result: 'success' });
  });

  it('deletes a task', () => {
    createTask(db, taskInput);
    expect(deleteTask(db, 'task-1')).toBe(true);
    expect(getTaskById(db, 'task-1')).toBeNull();
  });

  it('returns false when deleting nonexistent task', () => {
    expect(deleteTask(db, 'nonexistent')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Workflow
// ──────────────────────────────────────────────────────────────────────────────

describe('Workflow CRUD', () => {
  const workflowInput = {
    id: 'wf-1',
    name: 'Deploy Pipeline',
    steps: [
      { id: 'step-1', name: 'Build', type: 'build', config: {} },
      { id: 'step-2', name: 'Test', type: 'test', config: { coverage: true } },
    ],
    status: 'pending' as const,
  };

  it('creates a workflow and retrieves it', () => {
    const wf = createWorkflow(db, workflowInput);
    expect(wf.id).toBe('wf-1');
    expect(wf.name).toBe('Deploy Pipeline');
    expect(wf.steps).toHaveLength(2);
    expect(wf.steps[0].name).toBe('Build');
    expect(wf.status).toBe('pending');
  });

  it('returns null for missing workflow', () => {
    expect(getWorkflowById(db, 'nonexistent')).toBeNull();
  });

  it('lists all workflows', () => {
    createWorkflow(db, workflowInput);
    createWorkflow(db, { ...workflowInput, id: 'wf-2', name: 'CI Pipeline' });
    expect(listWorkflows(db)).toHaveLength(2);
  });

  it('updates workflow name and status', () => {
    createWorkflow(db, workflowInput);
    const updated = updateWorkflow(db, 'wf-1', { name: 'Release Pipeline', status: 'running' });
    expect(updated?.name).toBe('Release Pipeline');
    expect(updated?.status).toBe('running');
  });

  it('updates steps (JSON roundtrip)', () => {
    createWorkflow(db, workflowInput);
    const newSteps = [{ id: 's1', name: 'Deploy', type: 'deploy', config: { env: 'prod' } }];
    updateWorkflow(db, 'wf-1', { steps: newSteps });
    const result = getWorkflowById(db, 'wf-1');
    expect(result?.steps).toEqual(newSteps);
  });

  it('deletes a workflow', () => {
    createWorkflow(db, workflowInput);
    expect(deleteWorkflow(db, 'wf-1')).toBe(true);
    expect(getWorkflowById(db, 'wf-1')).toBeNull();
  });

  it('returns false when deleting nonexistent workflow', () => {
    expect(deleteWorkflow(db, 'nonexistent')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// ExecutionRun
// ──────────────────────────────────────────────────────────────────────────────

describe('ExecutionRun CRUD', () => {
  const runInput = {
    id: 'run-1',
    workflowId: 'wf-1',
    status: 'pending' as const,
    startedAt: null,
    completedAt: null,
    stepResults: [],
  };

  it('creates a run and retrieves it', () => {
    const run = createExecutionRun(db, runInput);
    expect(run.id).toBe('run-1');
    expect(run.workflowId).toBe('wf-1');
    expect(run.status).toBe('pending');
    expect(run.startedAt).toBeNull();
    expect(run.completedAt).toBeNull();
    expect(run.stepResults).toEqual([]);
  });

  it('returns null for missing run', () => {
    expect(getExecutionRunById(db, 'nonexistent')).toBeNull();
  });

  it('lists all runs', () => {
    createExecutionRun(db, runInput);
    createExecutionRun(db, { ...runInput, id: 'run-2' });
    expect(listExecutionRuns(db)).toHaveLength(2);
  });

  it('updates status and startedAt', () => {
    createExecutionRun(db, runInput);
    const start = new Date();
    const updated = updateExecutionRun(db, 'run-1', { status: 'running', startedAt: start });
    expect(updated?.status).toBe('running');
    expect(updated?.startedAt).toBeInstanceOf(Date);
  });

  it('records step results', () => {
    createExecutionRun(db, runInput);
    const results = [
      { stepId: 'step-1', status: 'success' as const, output: { built: true } },
    ];
    updateExecutionRun(db, 'run-1', { status: 'completed', stepResults: results });
    const r = getExecutionRunById(db, 'run-1');
    expect(r?.stepResults).toEqual(results);
    expect(r?.status).toBe('completed');
  });

  it('deletes a run', () => {
    createExecutionRun(db, runInput);
    expect(deleteExecutionRun(db, 'run-1')).toBe(true);
    expect(getExecutionRunById(db, 'run-1')).toBeNull();
  });

  it('returns false when deleting nonexistent run', () => {
    expect(deleteExecutionRun(db, 'nonexistent')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Event
// ──────────────────────────────────────────────────────────────────────────────

describe('Event CRUD', () => {
  const eventInput = {
    id: 'evt-1',
    type: 'task.completed',
    source: 'agent-1',
    payload: { taskId: 'task-1', result: 'ok' },
    timestamp: new Date('2026-01-01T00:00:00Z'),
  };

  it('creates an event and retrieves it', () => {
    const evt = createEvent(db, eventInput);
    expect(evt.id).toBe('evt-1');
    expect(evt.type).toBe('task.completed');
    expect(evt.source).toBe('agent-1');
    expect(evt.payload).toEqual({ taskId: 'task-1', result: 'ok' });
    expect(evt.timestamp).toBeInstanceOf(Date);
    expect(evt.createdAt).toBeInstanceOf(Date);
  });

  it('returns null for missing event', () => {
    expect(getEventById(db, 'nonexistent')).toBeNull();
  });

  it('lists all events', () => {
    createEvent(db, eventInput);
    createEvent(db, { ...eventInput, id: 'evt-2', type: 'task.started' });
    expect(listEvents(db)).toHaveLength(2);
  });

  it('preserves payload JSON roundtrip', () => {
    const complex = { ...eventInput, payload: { nested: { deep: [1, 2, 3] }, flag: true } };
    createEvent(db, complex);
    const result = getEventById(db, 'evt-1');
    expect(result?.payload).toEqual({ nested: { deep: [1, 2, 3] }, flag: true });
  });
});
