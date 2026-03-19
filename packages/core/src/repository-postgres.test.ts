/**
 * Integration tests for the PostgreSQL repository adapter.
 *
 * Requires a real PostgreSQL instance. Set POSTGRES_TEST_URL to enable:
 *   POSTGRES_TEST_URL=postgres://testuser:testpassword@localhost:5433/testdb pnpm --filter @mission-control/core test
 *
 * A PostgreSQL container can be started with:
 *   docker run -d --name mc-test-postgres \
 *     -e POSTGRES_PASSWORD=testpassword -e POSTGRES_USER=testuser -e POSTGRES_DB=testdb \
 *     -p 5433:5432 postgres:16-alpine
 */

import { createHash } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import postgres from 'postgres';
import { createPostgresRepositories } from './repository-postgres.js';
import type { Repositories } from './repository.js';

const TEST_URL = process.env.POSTGRES_TEST_URL;

// ── Schema DDL ────────────────────────────────────────────────────────────────

const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    capabilities JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'idle',
    metadata JSONB NOT NULL DEFAULT '{}',
    last_heartbeat_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    steps JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'medium',
    required_capabilities JSONB NOT NULL DEFAULT '[]',
    assignee_agent_id TEXT,
    workflow_id TEXT,
    execution_run_id TEXT,
    step_id TEXT,
    dependencies JSONB NOT NULL DEFAULT '[]',
    input JSONB NOT NULL DEFAULT '{}',
    output JSONB NOT NULL DEFAULT '{}',
    error_message TEXT,
    max_retries INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    retry_delay INTEGER NOT NULL DEFAULT 1000,
    timeout_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS execution_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    parent_run_id TEXT,
    parent_step_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    timeout_at TIMESTAMPTZ,
    step_results JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hashed_key TEXT NOT NULL UNIQUE,
    agent_id TEXT,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor_id TEXT,
    actor_type TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    events JSONB NOT NULL DEFAULT '[]',
    secret TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS alert_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    metric TEXT NOT NULL,
    operator TEXT NOT NULL,
    threshold INTEGER NOT NULL,
    webhook_url TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS alert_states (
    rule_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'ok',
    last_value INTEGER NOT NULL DEFAULT 0,
    fired_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL
  );
`;

const TRUNCATE_SQL = `
  TRUNCATE TABLE alert_states, alert_rules, webhooks, audit_log,
    api_keys, events, tasks, execution_runs, workflows, agents;
`;

// ── Test lifecycle ────────────────────────────────────────────────────────────

const skip = !TEST_URL;

let repos: Repositories;
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  if (skip) return;
  sql = postgres(TEST_URL!);
  await sql.unsafe(CREATE_TABLES_SQL);
  repos = createPostgresRepositories(TEST_URL!);
});

afterAll(async () => {
  if (skip) return;
  await sql.end();
  // Close the repos connection — postgres-js uses a connection pool internally;
  // we rely on process exit to clean it up since there's no public close() API.
});

beforeEach(async () => {
  if (skip) return;
  await sql.unsafe(TRUNCATE_SQL);
});

// ── Agent tests ───────────────────────────────────────────────────────────────

describe.skipIf(skip)('PostgreSQL — Agent CRUD', () => {
  const agentInput = {
    id: 'agent-1',
    name: 'Test Agent',
    capabilities: ['search', 'write'],
    status: 'idle' as const,
    metadata: { version: '1.0' },
  };

  it('creates an agent and retrieves it by id', async () => {
    const agent = await repos.agents.create(agentInput);
    expect(agent.id).toBe('agent-1');
    expect(agent.name).toBe('Test Agent');
    expect(agent.capabilities).toEqual(['search', 'write']);
    expect(agent.status).toBe('idle');
    expect(agent.metadata).toEqual({ version: '1.0' });
    expect(agent.createdAt).toBeInstanceOf(Date);
    expect(agent.updatedAt).toBeInstanceOf(Date);
  });

  it('returns null for missing agent', async () => {
    expect(await repos.agents.getById('nonexistent')).toBeNull();
  });

  it('lists all agents', async () => {
    await repos.agents.create(agentInput);
    await repos.agents.create({ ...agentInput, id: 'agent-2', name: 'Agent Two' });
    const all = await repos.agents.list();
    expect(all).toHaveLength(2);
  });

  it('updates an agent', async () => {
    await repos.agents.create(agentInput);
    const updated = await repos.agents.update('agent-1', { name: 'Updated', status: 'busy' });
    expect(updated?.name).toBe('Updated');
    expect(updated?.status).toBe('busy');
    expect(updated?.capabilities).toEqual(['search', 'write']);
  });

  it('returns null when updating nonexistent agent', async () => {
    const result = await repos.agents.update('nonexistent', { name: 'X' });
    expect(result).toBeNull();
  });

  it('deletes an agent', async () => {
    await repos.agents.create(agentInput);
    expect(await repos.agents.delete('agent-1')).toBe(true);
    expect(await repos.agents.getById('agent-1')).toBeNull();
  });

  it('returns false when deleting nonexistent agent', async () => {
    expect(await repos.agents.delete('nonexistent')).toBe(false);
  });

  it('updates capabilities correctly (JSON roundtrip)', async () => {
    await repos.agents.create(agentInput);
    await repos.agents.update('agent-1', { capabilities: ['read', 'write', 'execute'] });
    const result = await repos.agents.getById('agent-1');
    expect(result?.capabilities).toEqual(['read', 'write', 'execute']);
  });

  it('listByCapability returns only matching agents', async () => {
    await repos.agents.create(agentInput);
    await repos.agents.create({ ...agentInput, id: 'agent-2', name: 'Beta', capabilities: ['code-review', 'write'] });
    await repos.agents.create({ ...agentInput, id: 'agent-3', name: 'Gamma', capabilities: ['read'] });

    const writeAgents = await repos.agents.listByCapability('write');
    expect(writeAgents).toHaveLength(2);
    expect(writeAgents.map((a) => a.id)).toContain('agent-1');
    expect(writeAgents.map((a) => a.id)).toContain('agent-2');

    const readAgents = await repos.agents.listByCapability('read');
    expect(readAgents).toHaveLength(1);
    expect(readAgents[0].id).toBe('agent-3');
  });

  it('listByCapability returns empty array when no match', async () => {
    await repos.agents.create(agentInput);
    expect(await repos.agents.listByCapability('nonexistent')).toEqual([]);
  });

  it('heartbeat updates lastHeartbeatAt', async () => {
    await repos.agents.create(agentInput);
    const before = Date.now();
    const result = await repos.agents.heartbeat('agent-1');
    const after = Date.now();
    expect(result).not.toBeNull();
    expect(result!.lastHeartbeatAt).toBeInstanceOf(Date);
    const ts = result!.lastHeartbeatAt!.getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });

  it('heartbeat returns null for nonexistent agent', async () => {
    expect(await repos.agents.heartbeat('nonexistent')).toBeNull();
  });
});

// ── Task tests ────────────────────────────────────────────────────────────────

describe.skipIf(skip)('PostgreSQL — Task CRUD', () => {
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

  it('creates a task and retrieves it', async () => {
    const task = await repos.tasks.create(taskInput);
    expect(task.id).toBe('task-1');
    expect(task.title).toBe('Build feature');
    expect(task.status).toBe('pending');
    expect(task.input).toEqual({ repo: 'mission-control' });
    expect(task.dependencies).toEqual([]);
    expect(task.createdAt).toBeInstanceOf(Date);
  });

  it('returns null for missing task', async () => {
    expect(await repos.tasks.getById('nonexistent')).toBeNull();
  });

  it('lists all tasks', async () => {
    await repos.tasks.create(taskInput);
    await repos.tasks.create({ ...taskInput, id: 'task-2', title: 'Task Two' });
    expect(await repos.tasks.list()).toHaveLength(2);
  });

  it('updates task status and assignee', async () => {
    await repos.tasks.create(taskInput);
    const updated = await repos.tasks.update('task-1', {
      status: 'assigned',
      assigneeAgentId: 'agent-1',
    });
    expect(updated?.status).toBe('assigned');
    expect(updated?.assigneeAgentId).toBe('agent-1');
  });

  it('updates dependencies (JSON roundtrip)', async () => {
    await repos.tasks.create(taskInput);
    await repos.tasks.update('task-1', { dependencies: ['task-0', 'task-prereq'] });
    const result = await repos.tasks.getById('task-1');
    expect(result?.dependencies).toEqual(['task-0', 'task-prereq']);
  });

  it('updates output', async () => {
    await repos.tasks.create(taskInput);
    await repos.tasks.update('task-1', { status: 'completed', output: { result: 'success' } });
    const result = await repos.tasks.getById('task-1');
    expect(result?.output).toEqual({ result: 'success' });
  });

  it('deletes a task', async () => {
    await repos.tasks.create(taskInput);
    expect(await repos.tasks.delete('task-1')).toBe(true);
    expect(await repos.tasks.getById('task-1')).toBeNull();
  });

  it('returns false when deleting nonexistent task', async () => {
    expect(await repos.tasks.delete('nonexistent')).toBe(false);
  });

  it('listPending returns only pending tasks sorted by priority', async () => {
    await repos.tasks.create({ ...taskInput, id: 't-low', priority: 'low' });
    await repos.tasks.create({ ...taskInput, id: 't-high', priority: 'high' });
    await repos.tasks.create({ ...taskInput, id: 't-critical', priority: 'critical' });
    await repos.tasks.create({ ...taskInput, id: 't-assigned', status: 'assigned' });

    const pending = await repos.tasks.listPending();
    expect(pending.every((t) => t.status === 'pending')).toBe(true);
    expect(pending).toHaveLength(3);
    expect(pending[0].priority).toBe('critical');
    expect(pending[1].priority).toBe('high');
    expect(pending[2].priority).toBe('low');
  });

  it('listByStatus returns tasks filtered by status', async () => {
    await repos.tasks.create({ ...taskInput, id: 'running-1', status: 'running' });
    await repos.tasks.create({ ...taskInput, id: 'running-2', status: 'running' });
    await repos.tasks.create({ ...taskInput, id: 'pending-1', status: 'pending' });

    const running = await repos.tasks.listByStatus('running');
    expect(running).toHaveLength(2);
    expect(running.every((t) => t.status === 'running')).toBe(true);
  });

  it('listByExecutionRun returns tasks for a given run', async () => {
    await repos.tasks.create({ ...taskInput, id: 'task-r1a', executionRunId: 'run-1' });
    await repos.tasks.create({ ...taskInput, id: 'task-r1b', executionRunId: 'run-1' });
    await repos.tasks.create({ ...taskInput, id: 'task-r2', executionRunId: 'run-2' });

    const forRun1 = await repos.tasks.listByExecutionRun('run-1');
    expect(forRun1).toHaveLength(2);
    expect(forRun1.every((t) => t.executionRunId === 'run-1')).toBe(true);
  });

  it('requeueForRetry marks task as dead_letter after max retries', async () => {
    await repos.tasks.create({ ...taskInput, id: 'task-retry', maxRetries: 2, retryCount: 2 });
    const result = await repos.tasks.requeueForRetry('task-retry', 'timeout');
    expect(result?.status).toBe('dead_letter');
    expect(result?.errorMessage).toBe('timeout');
  });

  it('requeueForRetry requeues as pending if retries remain', async () => {
    await repos.tasks.create({ ...taskInput, id: 'task-retry2', maxRetries: 3, retryCount: 1 });
    const result = await repos.tasks.requeueForRetry('task-retry2', 'transient error');
    expect(result?.status).toBe('pending');
    expect(result?.retryCount).toBe(2);
    expect(result?.errorMessage).toBe('transient error');
  });

  it('listDeadLetter returns dead_letter tasks sorted newest first', async () => {
    await repos.tasks.create({ ...taskInput, id: 'dl-1', status: 'dead_letter' });
    await repos.tasks.create({ ...taskInput, id: 'dl-2', status: 'dead_letter' });

    const dl = await repos.tasks.listDeadLetter();
    expect(dl).toHaveLength(2);
    expect(dl.every((t) => t.status === 'dead_letter')).toBe(true);
  });
});

// ── Workflow tests ────────────────────────────────────────────────────────────

describe.skipIf(skip)('PostgreSQL — Workflow CRUD', () => {
  const workflowInput = {
    id: 'wf-1',
    name: 'Deploy Pipeline',
    steps: [
      { id: 'step-1', name: 'Build', type: 'build', config: {} },
      { id: 'step-2', name: 'Test', type: 'test', config: { coverage: true } },
    ],
    status: 'pending' as const,
  };

  it('creates a workflow and retrieves it', async () => {
    const wf = await repos.workflows.create(workflowInput);
    expect(wf.id).toBe('wf-1');
    expect(wf.name).toBe('Deploy Pipeline');
    expect(wf.steps).toHaveLength(2);
    expect(wf.steps[0].name).toBe('Build');
    expect(wf.status).toBe('pending');
  });

  it('returns null for missing workflow', async () => {
    expect(await repos.workflows.getById('nonexistent')).toBeNull();
  });

  it('lists all workflows', async () => {
    await repos.workflows.create(workflowInput);
    await repos.workflows.create({ ...workflowInput, id: 'wf-2', name: 'CI Pipeline' });
    expect(await repos.workflows.list()).toHaveLength(2);
  });

  it('updates workflow name and status', async () => {
    await repos.workflows.create(workflowInput);
    const updated = await repos.workflows.update('wf-1', { name: 'Release Pipeline', status: 'running' });
    expect(updated?.name).toBe('Release Pipeline');
    expect(updated?.status).toBe('running');
  });

  it('updates steps (JSON roundtrip)', async () => {
    await repos.workflows.create(workflowInput);
    const newSteps = [{ id: 's1', name: 'Deploy', type: 'deploy', config: { env: 'prod' } }];
    await repos.workflows.update('wf-1', { steps: newSteps });
    const result = await repos.workflows.getById('wf-1');
    expect(result?.steps).toEqual(newSteps);
  });

  it('deletes a workflow', async () => {
    await repos.workflows.create(workflowInput);
    expect(await repos.workflows.delete('wf-1')).toBe(true);
    expect(await repos.workflows.getById('wf-1')).toBeNull();
  });

  it('returns false when deleting nonexistent workflow', async () => {
    expect(await repos.workflows.delete('nonexistent')).toBe(false);
  });
});

// ── ExecutionRun tests ────────────────────────────────────────────────────────

describe.skipIf(skip)('PostgreSQL — ExecutionRun CRUD', () => {
  const runInput = {
    id: 'run-1',
    workflowId: 'wf-1',
    status: 'pending' as const,
    startedAt: null,
    completedAt: null,
    stepResults: [],
  };

  it('creates a run and retrieves it', async () => {
    const run = await repos.executionRuns.create(runInput);
    expect(run.id).toBe('run-1');
    expect(run.workflowId).toBe('wf-1');
    expect(run.status).toBe('pending');
    expect(run.startedAt).toBeNull();
    expect(run.completedAt).toBeNull();
    expect(run.stepResults).toEqual([]);
  });

  it('returns null for missing run', async () => {
    expect(await repos.executionRuns.getById('nonexistent')).toBeNull();
  });

  it('lists all runs', async () => {
    await repos.executionRuns.create(runInput);
    await repos.executionRuns.create({ ...runInput, id: 'run-2' });
    expect(await repos.executionRuns.list()).toHaveLength(2);
  });

  it('updates status and startedAt', async () => {
    await repos.executionRuns.create(runInput);
    const start = new Date();
    const updated = await repos.executionRuns.update('run-1', { status: 'running', startedAt: start });
    expect(updated?.status).toBe('running');
    expect(updated?.startedAt).toBeInstanceOf(Date);
  });

  it('records step results', async () => {
    await repos.executionRuns.create(runInput);
    const results = [{ stepId: 'step-1', status: 'success' as const, output: { built: true } }];
    await repos.executionRuns.update('run-1', { status: 'completed', stepResults: results });
    const r = await repos.executionRuns.getById('run-1');
    expect(r?.stepResults).toEqual(results);
    expect(r?.status).toBe('completed');
  });

  it('deletes a run', async () => {
    await repos.executionRuns.create(runInput);
    expect(await repos.executionRuns.delete('run-1')).toBe(true);
    expect(await repos.executionRuns.getById('run-1')).toBeNull();
  });

  it('returns false when deleting nonexistent run', async () => {
    expect(await repos.executionRuns.delete('nonexistent')).toBe(false);
  });
});

// ── Event tests ───────────────────────────────────────────────────────────────

describe.skipIf(skip)('PostgreSQL — Event CRUD', () => {
  const eventInput = {
    id: 'evt-1',
    type: 'task.completed',
    source: 'agent-1',
    payload: { taskId: 'task-1', result: 'ok' },
    timestamp: new Date('2026-01-01T00:00:00Z'),
  };

  it('creates an event and retrieves it', async () => {
    const evt = await repos.events.create(eventInput);
    expect(evt.id).toBe('evt-1');
    expect(evt.type).toBe('task.completed');
    expect(evt.source).toBe('agent-1');
    expect(evt.payload).toEqual({ taskId: 'task-1', result: 'ok' });
    expect(evt.timestamp).toBeInstanceOf(Date);
    expect(evt.createdAt).toBeInstanceOf(Date);
  });

  it('returns null for missing event', async () => {
    expect(await repos.events.getById('nonexistent')).toBeNull();
  });

  it('lists all events', async () => {
    await repos.events.create(eventInput);
    await repos.events.create({ ...eventInput, id: 'evt-2', type: 'task.started' });
    expect(await repos.events.list()).toHaveLength(2);
  });

  it('preserves payload JSON roundtrip', async () => {
    const complex = { ...eventInput, payload: { nested: { deep: [1, 2, 3] }, flag: true } };
    await repos.events.create(complex);
    const result = await repos.events.getById('evt-1');
    expect(result?.payload).toEqual({ nested: { deep: [1, 2, 3] }, flag: true });
  });
});

// ── ApiKey tests ──────────────────────────────────────────────────────────────

describe.skipIf(skip)('PostgreSQL — ApiKey CRUD', () => {
  const keyInput = {
    id: 'key-1',
    name: 'Test Key',
    hashedKey: 'abc123hashed',
    agentId: null,
    role: 'operator' as const,
  };

  it('creates an api key and retrieves it', async () => {
    const key = await repos.apiKeys.create(keyInput);
    expect(key.id).toBe('key-1');
    expect(key.name).toBe('Test Key');
    expect(key.hashedKey).toBe('abc123hashed');
    expect(key.role).toBe('operator');
    expect(key.revokedAt).toBeNull();
    expect(key.createdAt).toBeInstanceOf(Date);
  });

  it('returns null for missing key', async () => {
    expect(await repos.apiKeys.getById('nonexistent')).toBeNull();
  });

  it('lists all keys', async () => {
    await repos.apiKeys.create(keyInput);
    await repos.apiKeys.create({ ...keyInput, id: 'key-2', name: 'Key 2', hashedKey: 'def456' });
    expect(await repos.apiKeys.list()).toHaveLength(2);
  });

  it('getByPlaintext returns key matching sha256 hash', async () => {
    const plaintext = 'mysecretapikey';
    const hashed = createHash('sha256').update(plaintext).digest('hex');
    await repos.apiKeys.create({ ...keyInput, id: 'key-plain', hashedKey: hashed });
    const result = await repos.apiKeys.getByPlaintext(plaintext);
    expect(result?.id).toBe('key-plain');
  });

  it('revokes an api key', async () => {
    await repos.apiKeys.create(keyInput);
    const revoked = await repos.apiKeys.revoke('key-1');
    expect(revoked?.revokedAt).toBeInstanceOf(Date);
  });
});

// ── AuditLog tests ────────────────────────────────────────────────────────────

describe.skipIf(skip)('PostgreSQL — AuditLog CRUD', () => {
  const logInput = {
    actorId: 'agent-1',
    actorType: 'agent' as const,
    action: 'task.create',
    resourceType: 'task',
    resourceId: 'task-1',
    metadata: { ip: '127.0.0.1' },
    timestamp: new Date('2026-01-01T12:00:00Z'),
  };

  it('creates an audit log entry', async () => {
    const entry = await repos.auditLog.create(logInput);
    expect(entry.actorId).toBe('agent-1');
    expect(entry.actorType).toBe('agent');
    expect(entry.action).toBe('task.create');
    expect(entry.resourceType).toBe('task');
    expect(entry.metadata).toEqual({ ip: '127.0.0.1' });
    expect(entry.timestamp).toBeInstanceOf(Date);
  });

  it('lists audit log entries', async () => {
    await repos.auditLog.create(logInput);
    await repos.auditLog.create({ ...logInput, action: 'task.delete', timestamp: new Date('2026-01-02T00:00:00Z') });
    const entries = await repos.auditLog.list();
    expect(entries).toHaveLength(2);
  });

  it('filters by actorId', async () => {
    await repos.auditLog.create(logInput);
    await repos.auditLog.create({ ...logInput, actorId: 'agent-2', action: 'task.update' });
    const entries = await repos.auditLog.list({ actorId: 'agent-1' });
    expect(entries).toHaveLength(1);
    expect(entries[0].actorId).toBe('agent-1');
  });

  it('filters by resourceType', async () => {
    await repos.auditLog.create(logInput);
    await repos.auditLog.create({ ...logInput, resourceType: 'workflow', action: 'wf.start' });
    const entries = await repos.auditLog.list({ resourceType: 'task' });
    expect(entries).toHaveLength(1);
    expect(entries[0].resourceType).toBe('task');
  });

  it('filters by date range', async () => {
    await repos.auditLog.create({ ...logInput, timestamp: new Date('2026-01-01T00:00:00Z') });
    await repos.auditLog.create({ ...logInput, action: 'b', timestamp: new Date('2026-03-01T00:00:00Z') });
    await repos.auditLog.create({ ...logInput, action: 'c', timestamp: new Date('2026-06-01T00:00:00Z') });

    const entries = await repos.auditLog.list({
      from: new Date('2026-02-01T00:00:00Z'),
      to: new Date('2026-04-01T00:00:00Z'),
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('b');
  });
});

// ── Webhook tests ─────────────────────────────────────────────────────────────

describe.skipIf(skip)('PostgreSQL — Webhook CRUD', () => {
  const webhookInput = {
    id: 'wh-1',
    url: 'https://example.com/hook',
    events: ['task.completed', 'workflow.failed'],
    secret: 'supersecret',
    active: true,
  };

  it('creates and retrieves a webhook', async () => {
    const wh = await repos.webhooks.create(webhookInput);
    expect(wh.id).toBe('wh-1');
    expect(wh.url).toBe('https://example.com/hook');
    expect(wh.events).toEqual(['task.completed', 'workflow.failed']);
    expect(wh.secret).toBe('supersecret');
    expect(wh.active).toBe(true);
    expect(wh.createdAt).toBeInstanceOf(Date);
  });

  it('lists webhooks', async () => {
    await repos.webhooks.create(webhookInput);
    await repos.webhooks.create({ ...webhookInput, id: 'wh-2', url: 'https://b.com', secret: 's2' });
    expect(await repos.webhooks.list()).toHaveLength(2);
  });

  it('updates a webhook', async () => {
    await repos.webhooks.create(webhookInput);
    const updated = await repos.webhooks.update('wh-1', { active: false });
    expect(updated?.active).toBe(false);
  });

  it('deletes a webhook', async () => {
    await repos.webhooks.create(webhookInput);
    expect(await repos.webhooks.delete('wh-1')).toBe(true);
    expect(await repos.webhooks.getById('wh-1')).toBeNull();
  });

  it('returns null for missing webhook', async () => {
    expect(await repos.webhooks.getById('missing')).toBeNull();
  });

  it('listActiveForEvent returns webhooks subscribed to that event', async () => {
    await repos.webhooks.create({ ...webhookInput, id: 'wh-active', events: ['task.*'], active: true });
    await repos.webhooks.create({ ...webhookInput, id: 'wh-inactive', events: ['task.*'], active: false, secret: 'x' });
    await repos.webhooks.create({ ...webhookInput, id: 'wh-other', events: ['workflow.*'], active: true, secret: 'y' });

    const active = await repos.webhooks.listActiveForEvent('task.completed');
    expect(active.every((w) => w.active)).toBe(true);
    expect(active.map((w) => w.id)).toContain('wh-active');
    expect(active.map((w) => w.id)).not.toContain('wh-inactive');
  });
});

// ── Alert tests ───────────────────────────────────────────────────────────────

describe.skipIf(skip)('PostgreSQL — Alert CRUD', () => {
  const ruleInput = {
    id: 'rule-1',
    name: 'High Queue',
    metric: 'task_queue_depth' as const,
    operator: 'gt' as const,
    threshold: 90,
    webhookUrl: 'https://alerts.example.com',
    active: true,
  };

  it('creates and retrieves an alert rule', async () => {
    const rule = await repos.alerts.createRule(ruleInput);
    expect(rule.id).toBe('rule-1');
    expect(rule.name).toBe('High Queue');
    expect(rule.metric).toBe('task_queue_depth');
    expect(rule.operator).toBe('gt');
    expect(rule.threshold).toBe(90);
    expect(rule.active).toBe(true);
    expect(rule.createdAt).toBeInstanceOf(Date);
  });

  it('returns null for missing rule', async () => {
    expect(await repos.alerts.getRuleById('nonexistent')).toBeNull();
  });

  it('lists all rules', async () => {
    await repos.alerts.createRule(ruleInput);
    await repos.alerts.createRule({ ...ruleInput, id: 'rule-2', name: 'Low Memory' });
    expect(await repos.alerts.listRules()).toHaveLength(2);
  });

  it('updates a rule', async () => {
    await repos.alerts.createRule(ruleInput);
    const updated = await repos.alerts.updateRule('rule-1', { threshold: 95, active: false });
    expect(updated?.threshold).toBe(95);
    expect(updated?.active).toBe(false);
  });

  it('deletes a rule', async () => {
    await repos.alerts.createRule(ruleInput);
    expect(await repos.alerts.deleteRule('rule-1')).toBe(true);
    expect(await repos.alerts.getRuleById('rule-1')).toBeNull();
  });

  it('upserts alert state and retrieves it', async () => {
    await repos.alerts.createRule(ruleInput);
    const state = await repos.alerts.upsertState('rule-1', 'firing', 95);
    expect(state.ruleId).toBe('rule-1');
    expect(state.status).toBe('firing');
    expect(state.lastValue).toBe(95);
    expect(state.firedAt).toBeInstanceOf(Date);
    expect(state.resolvedAt).toBeNull();
  });

  it('upsert resolves firing alert when status becomes ok', async () => {
    await repos.alerts.createRule(ruleInput);
    await repos.alerts.upsertState('rule-1', 'firing', 95);
    const resolved = await repos.alerts.upsertState('rule-1', 'ok', 40);
    expect(resolved.status).toBe('ok');
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
  });

  it('lists all alert states', async () => {
    await repos.alerts.createRule(ruleInput);
    await repos.alerts.createRule({ ...ruleInput, id: 'rule-2', name: 'Rule 2' });
    await repos.alerts.upsertState('rule-1', 'ok', 0);
    await repos.alerts.upsertState('rule-2', 'firing', 100);
    const states = await repos.alerts.listStates();
    expect(states).toHaveLength(2);
  });
});
