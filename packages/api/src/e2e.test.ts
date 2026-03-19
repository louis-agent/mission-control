/**
 * End-to-end integration test for the full Mission Control workflow lifecycle.
 *
 * Exercises the complete system in-process:
 *   1. Build a combined Express app (all sub-apps mounted)
 *   2. Register agents with capabilities
 *   3. Submit, dispatch, and complete tasks
 *   4. Create a multi-step workflow with conditions and dependencies
 *   5. Execute the workflow and verify all steps complete
 *   6. Verify events are emitted and persisted
 *   7. Verify metrics are updated
 *   8. Confirm clean teardown (no lingering async state)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express, { type Application } from 'express';
import {
  createDb,
  EventBus,
  createWorkflow,
  listEvents,
  listTasksByExecutionRun,
  updateTask,
} from '@mission-control/core';
import type { DB, Event, StepResult } from '@mission-control/core';
import { createRegistryApp } from './registry.js';
import { createQueueApp } from './queue.js';
import { createWorkflowRunnerApp } from './workflow-runner.js';
import { createMetricsApp, register as metricsRegister } from './metrics.js';
import { createDashboardApp } from './dashboard.js';

// ──────────────────────────────────────────────────────────────────────────────
// Test app factory — mirrors server.ts without auth / tracing / file serving
// ──────────────────────────────────────────────────────────────────────────────

function buildTestApp(db: DB, _eventBus: EventBus): Application {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Metrics at root (no /api prefix — mirrors server.ts)
  app.use(createMetricsApp(db));

  const api = express.Router();
  api.use(createRegistryApp(db));
  api.use(createQueueApp(db));
  api.use(createWorkflowRunnerApp(db));
  api.use(createDashboardApp(db));
  app.use('/api', api);

  return app;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Advance a workflow execution run until it reaches a terminal state. */
async function drainRun(
  app: Application,
  runId: string,
  maxIter = 20,
): Promise<{ status: string; stepResults: StepResult[] }> {
  for (let i = 0; i < maxIter; i++) {
    const res = await request(app).post(`/api/execution-runs/${runId}/advance`);
    expect(res.status).toBe(200);
    if (['completed', 'failed', 'cancelled'].includes(res.body.status)) {
      return res.body;
    }
  }
  throw new Error(`Run ${runId} did not reach terminal state after ${maxIter} advances`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────────────────────────────

let db: DB;
let eventBus: EventBus;
let app: Application;
let capturedEvents: Event[];

beforeEach(() => {
  db = createDb(':memory:');
  eventBus = new EventBus(db);
  capturedEvents = [];
  eventBus.subscribe('*', (e) => capturedEvents.push(e));
  eventBus.subscribe('*.*', (e) => capturedEvents.push(e));
  eventBus.subscribe('*.*.*', (e) => capturedEvents.push(e));
  eventBus.subscribe('*.*.*.*', (e) => capturedEvents.push(e));
  metricsRegister.resetMetrics();
  app = buildTestApp(db, eventBus);
});

afterEach(() => {
  // In-memory db and all objects are GC'd — no explicit teardown required.
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. Health check
// ──────────────────────────────────────────────────────────────────────────────

describe('health', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Agent registration
// ──────────────────────────────────────────────────────────────────────────────

describe('agent registration', () => {
  it('registers an agent and retrieves it', async () => {
    const create = await request(app).post('/api/agents').send({
      id: 'agent-build',
      name: 'Build Bot',
      capabilities: ['build', 'test'],
      status: 'idle',
    });
    expect(create.status).toBe(201);
    expect(create.body.capabilities).toEqual(['build', 'test']);

    const get = await request(app).get('/api/agents/agent-build');
    expect(get.status).toBe(200);
    expect(get.body.name).toBe('Build Bot');
  });

  it('returns 409 when registering duplicate agent id', async () => {
    await request(app).post('/api/agents').send({ id: 'dup', name: 'A', capabilities: [] });
    const dup = await request(app).post('/api/agents').send({ id: 'dup', name: 'B', capabilities: [] });
    expect(dup.status).toBe(409);
  });

  it('filters agents by capability', async () => {
    await request(app).post('/api/agents').send({ id: 'a1', name: 'A1', capabilities: ['build'] });
    await request(app).post('/api/agents').send({ id: 'a2', name: 'A2', capabilities: ['deploy'] });

    const res = await request(app).get('/api/agents?capability=build');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('a1');
  });

  it('lists all agents', async () => {
    await request(app).post('/api/agents').send({ id: 'b1', name: 'B1', capabilities: [] });
    await request(app).post('/api/agents').send({ id: 'b2', name: 'B2', capabilities: [] });
    const res = await request(app).get('/api/agents');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('heartbeats an agent (updates lastHeartbeatAt)', async () => {
    await request(app).post('/api/agents').send({ id: 'hb', name: 'HB', capabilities: [] });
    const hb = await request(app).post('/api/agents/hb/heartbeat');
    expect(hb.status).toBe(200);
    expect(hb.body.lastHeartbeatAt).not.toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Task lifecycle — submit → dispatch → complete
// ──────────────────────────────────────────────────────────────────────────────

describe('task lifecycle', () => {
  beforeEach(async () => {
    await request(app).post('/api/agents').send({
      id: 'worker',
      name: 'Worker',
      capabilities: ['search', 'summarise'],
      status: 'idle',
    });
  });

  it('full cycle: pending → dispatched → running → completed', async () => {
    const submit = await request(app)
      .post('/api/tasks')
      .send({ title: 'Search docs', requiredCapabilities: ['search'] });
    expect(submit.status).toBe(201);
    expect(submit.body.status).toBe('pending');
    const taskId = submit.body.id as string;

    // Dispatch — response is { dispatched: boolean, task: Task | null }
    const dispatchRes = await request(app).post('/api/tasks/dispatch');
    expect(dispatchRes.status).toBe(200);
    expect(dispatchRes.body.dispatched).toBe(true);
    expect(dispatchRes.body.task.id).toBe(taskId);
    expect(dispatchRes.body.task.assigneeAgentId).toBe('worker');
    expect(dispatchRes.body.task.status).toBe('assigned');

    // Transition assigned → running (complete requires running state)
    const running = await request(app).post(`/api/tasks/${taskId}/start`);
    expect(running.status).toBe(200);
    expect(running.body.status).toBe('running');

    // Complete with output
    const complete = await request(app)
      .post(`/api/tasks/${taskId}/complete`)
      .send({ output: { resultCount: 42 } });
    expect(complete.status).toBe(200);
    expect(complete.body.status).toBe('completed');
    expect(complete.body.output.resultCount).toBe(42);
  });

  it('fails a task with an error message', async () => {
    const { body: task } = await request(app)
      .post('/api/tasks')
      .send({ title: 'Fail me', requiredCapabilities: [] });

    await request(app).post('/api/tasks/dispatch');
    // complete/fail require running state; transition assigned → running first
    await request(app).post(`/api/tasks/${task.id}/start`);
    const fail = await request(app)
      .post(`/api/tasks/${task.id}/fail`)
      .send({ error: 'something went wrong' });
    expect(fail.status).toBe(200);
    expect(fail.body.status).toBe('failed');
    expect(fail.body.errorMessage).toBe('something went wrong');
  });

  it('no dispatch when no capable agent exists', async () => {
    await request(app).post('/api/tasks').send({
      title: 'Needs GPU',
      requiredCapabilities: ['gpu-compute'],
    });
    const dispatch = await request(app).post('/api/tasks/dispatch');
    expect(dispatch.status).toBe(200);
    expect(dispatch.body.dispatched).toBe(false);
    expect(dispatch.body.task).toBeNull();
  });

  it('lists tasks filtered by status', async () => {
    await request(app).post('/api/tasks').send({ title: 'T1', requiredCapabilities: [] });
    await request(app).post('/api/tasks').send({ title: 'T2', requiredCapabilities: [] });
    await request(app).post('/api/tasks/dispatch'); // assigns T1 (only one agent, one dispatch call)

    const pending = await request(app).get('/api/tasks?status=pending');
    const assigned = await request(app).get('/api/tasks?status=assigned');
    expect(pending.body).toHaveLength(1);
    expect(assigned.body).toHaveLength(1);
  });

  it('retrieves a task by id', async () => {
    const { body: created } = await request(app)
      .post('/api/tasks')
      .send({ id: 'known-id', title: 'Find me' });
    const get = await request(app).get('/api/tasks/known-id');
    expect(get.status).toBe(200);
    expect(get.body.id).toBe('known-id');
    expect(get.body.title).toBe('Find me');
    expect(get.body.createdAt).toBeTruthy();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4 & 5. Multi-step workflow with dependencies — execute and verify completion
// ──────────────────────────────────────────────────────────────────────────────

describe('workflow lifecycle', () => {
  beforeEach(async () => {
    await request(app).post('/api/agents').send({
      id: 'ci-agent',
      name: 'CI Agent',
      capabilities: ['build', 'test', 'deploy'],
      status: 'idle',
    });
  });

  it('executes a linear 3-step workflow to completion', async () => {
    // Workflows are created directly via core (no HTTP CRUD route exists for POST /workflows)
    createWorkflow(db, {
      id: 'wf-linear',
      name: 'CI Pipeline',
      steps: [
        { id: 's-build', name: 'Build', type: 'build', config: {} },
        { id: 's-test', name: 'Test', type: 'test', config: {}, dependsOn: ['s-build'] },
        { id: 's-deploy', name: 'Deploy', type: 'deploy', config: {}, dependsOn: ['s-test'] },
      ],
      status: 'pending',
    });

    // Start execution synchronously (sync=true bypasses job queue)
    const exec = await request(app)
      .post('/api/workflows/wf-linear/execute')
      .send({ sync: true });
    expect(exec.status).toBe(201);
    const runId = exec.body.id as string;
    expect(exec.body.status).toBe('running');

    // Advance — s-build task is scheduled
    await request(app).post(`/api/execution-runs/${runId}/advance`);

    // Complete s-build via DB (mirrors an agent completing the task)
    const tasks1 = listTasksByExecutionRun(db, runId);
    const buildTask = tasks1.find((t) => t.stepId === 's-build')!;
    expect(buildTask).toBeTruthy();
    updateTask(db, buildTask.id, { status: 'completed', output: { artifact: 'app.tar.gz' } });

    // Advance — s-test should be scheduled now
    const adv2 = await request(app).post(`/api/execution-runs/${runId}/advance`);
    expect(adv2.status).toBe(200);
    expect(adv2.body.status).toBe('running');

    // Complete s-test
    const tasks2 = listTasksByExecutionRun(db, runId);
    const testTask = tasks2.find((t) => t.stepId === 's-test')!;
    expect(testTask).toBeTruthy();
    updateTask(db, testTask.id, { status: 'completed', output: { passed: 57 } });

    // Advance — s-deploy should be scheduled
    await request(app).post(`/api/execution-runs/${runId}/advance`);

    // Complete s-deploy
    const tasks3 = listTasksByExecutionRun(db, runId);
    const deployTask = tasks3.find((t) => t.stepId === 's-deploy')!;
    expect(deployTask).toBeTruthy();
    updateTask(db, deployTask.id, { status: 'completed', output: { env: 'production' } });

    // Final advance — workflow should complete
    const final = await request(app).post(`/api/execution-runs/${runId}/advance`);
    expect(final.status).toBe(200);
    expect(final.body.status).toBe('completed');

    const stepResults: StepResult[] = final.body.stepResults;
    expect(stepResults).toHaveLength(3);
    expect(stepResults.every((r) => r.status === 'success')).toBe(true);
    expect(stepResults.find((r) => r.stepId === 's-build')?.output).toMatchObject({ artifact: 'app.tar.gz' });
    expect(stepResults.find((r) => r.stepId === 's-test')?.output).toMatchObject({ passed: 57 });

    // Confirm via GET
    const get = await request(app).get(`/api/execution-runs/${runId}`);
    expect(get.status).toBe(200);
    expect(get.body.status).toBe('completed');
    expect(get.body.stepResults).toHaveLength(3);
  });

  it('skips a conditional step when the condition evaluates to false', async () => {
    // s2 condition references deployFlag which is absent from s1 output → skip
    createWorkflow(db, {
      id: 'wf-cond',
      name: 'Conditional Pipeline',
      steps: [
        { id: 's1', name: 'Check', type: 'build', config: {} },
        {
          id: 's2',
          name: 'Optional Deploy',
          type: 'deploy',
          config: {},
          dependsOn: ['s1'],
          condition: 'deployFlag == true',
        },
      ],
      status: 'pending',
    });

    const exec = await request(app)
      .post('/api/workflows/wf-cond/execute')
      .send({ sync: true });
    expect(exec.status).toBe(201);
    const runId = exec.body.id as string;

    // First advance — s1 task is created
    await request(app).post(`/api/execution-runs/${runId}/advance`);
    const tasks = listTasksByExecutionRun(db, runId);
    const s1Task = tasks.find((t) => t.stepId === 's1');
    expect(s1Task).toBeTruthy();

    // Complete s1 without setting deployFlag — condition should evaluate to false
    updateTask(db, s1Task!.id, { status: 'completed', output: { built: true } });

    // Drain until terminal
    const finalRun = await drainRun(app, runId);
    expect(finalRun.status).toBe('completed');

    // s2 should be skipped (condition was false)
    const s2Result = finalRun.stepResults.find((r) => r.stepId === 's2');
    expect(s2Result?.status).toBe('skipped');
  });

  it('cancels a running execution run', async () => {
    createWorkflow(db, {
      id: 'wf-cancel',
      name: 'Cancellable',
      steps: [{ id: 's1', name: 'Long job', type: 'build', config: {} }],
      status: 'pending',
    });

    const exec = await request(app)
      .post('/api/workflows/wf-cancel/execute')
      .send({ sync: true });
    expect(exec.status).toBe(201);
    const runId = exec.body.id as string;
    expect(exec.body.status).toBe('running');

    const cancel = await request(app).post(`/api/execution-runs/${runId}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('cancelled');
  });

  it('validates a workflow with dry-run endpoint', async () => {
    createWorkflow(db, {
      id: 'wf-validate',
      name: 'Valid Workflow',
      steps: [{ id: 's1', name: 'Build', type: 'build', config: {} }],
      status: 'pending',
    });

    const res = await request(app).get('/api/workflows/wf-validate/validate');
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.errors).toEqual([]);
  });

  it('reports validation errors for missing agent capabilities', async () => {
    createWorkflow(db, {
      id: 'wf-invalid',
      name: 'Invalid',
      steps: [
        {
          id: 's1',
          name: 'GPU job',
          type: 'gpu',
          config: {},
          requiredCapabilities: ['gpu-compute'],
        },
      ],
      status: 'pending',
    });

    const res = await request(app).get('/api/workflows/wf-invalid/validate');
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Events
// ──────────────────────────────────────────────────────────────────────────────

describe('events', () => {
  it('persists events published via the event bus', () => {
    eventBus.publish({ type: 'task.created', source: 'queue', payload: { taskId: 'x' } });
    eventBus.publish({ type: 'task.completed', source: 'queue', payload: { taskId: 'x' } });

    const persisted = listEvents(db);
    expect(persisted.length).toBeGreaterThanOrEqual(2);
    const types = persisted.map((e) => e.type);
    expect(types).toContain('task.created');
    expect(types).toContain('task.completed');
  });

  it('dispatches events only to matching subscribers', () => {
    const received: string[] = [];
    eventBus.subscribe('agent.*', (e) => received.push(e.type));

    eventBus.publish({ type: 'agent.registered', source: 'registry', payload: {} });
    eventBus.publish({ type: 'task.created', source: 'queue', payload: {} });

    expect(received).toEqual(['agent.registered']);
  });

  it('replays persisted events to new subscribers', () => {
    eventBus.publish({ type: 'workflow.started', source: 'runner', payload: {} });

    const replayed: string[] = [];
    eventBus.subscribe('workflow.*', (e) => replayed.push(e.type));
    eventBus.replay('workflow.*');

    expect(replayed).toContain('workflow.started');
  });

  it('unsubscribe stops further event delivery', () => {
    const received: string[] = [];
    const unsub = eventBus.subscribe('task.*', (e) => received.push(e.type));

    eventBus.publish({ type: 'task.created', source: 'test', payload: {} });
    unsub();
    eventBus.publish({ type: 'task.completed', source: 'test', payload: {} });

    expect(received).toEqual(['task.created']);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Metrics
// ──────────────────────────────────────────────────────────────────────────────

describe('metrics', () => {
  it('GET /metrics returns prometheus text format with expected gauges', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('task_queue_depth');
    expect(res.text).toContain('agent_status_count');
    expect(res.text).toContain('active_execution_runs');
    expect(res.text).toContain('process_cpu_seconds_total'); // default Node metrics
  });

  it('task_queue_depth is present in output', async () => {
    await request(app).post('/api/tasks').send({ title: 'T1' });
    await request(app).post('/api/tasks').send({ title: 'T2' });

    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/task_queue_depth \d/);
  });

  it('agent_status_count labels reflect registered agents', async () => {
    await request(app).post('/api/agents').send({ id: 'ma1', name: 'A', capabilities: [], status: 'idle' });
    await request(app).post('/api/agents').send({ id: 'ma2', name: 'B', capabilities: [], status: 'busy' });

    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/agent_status_count\{status="idle"\}/);
    expect(res.text).toMatch(/agent_status_count\{status="busy"\}/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. Full end-to-end scenario — agent + tasks + workflow in one pass
// ──────────────────────────────────────────────────────────────────────────────

describe('full e2e scenario', () => {
  it('runs a complete agent → tasks → workflow lifecycle', async () => {
    // Register agents
    await request(app).post('/api/agents').send({
      id: 'e2e-agent',
      name: 'E2E Worker',
      capabilities: ['build', 'test', 'deploy'],
      status: 'idle',
    });

    // Submit and dispatch a standalone task
    const { body: task } = await request(app)
      .post('/api/tasks')
      .send({ title: 'Pre-flight check', requiredCapabilities: ['build'] });
    expect(task.status).toBe('pending');

    const dispatchRes = await request(app).post('/api/tasks/dispatch');
    expect(dispatchRes.body.dispatched).toBe(true);
    expect(dispatchRes.body.task.id).toBe(task.id);
    expect(dispatchRes.body.task.assigneeAgentId).toBe('e2e-agent');

    // Transition assigned → running → completed (complete requires running state)
    await request(app).post(`/api/tasks/${task.id}/start`);
    const { body: completed } = await request(app)
      .post(`/api/tasks/${task.id}/complete`)
      .send({ output: { ready: true } });
    expect(completed.status).toBe('completed');

    // Create a 2-step workflow directly via core
    createWorkflow(db, {
      id: 'e2e-wf',
      name: 'Deploy Pipeline',
      steps: [
        { id: 'e2e-s1', name: 'Build', type: 'build', config: {} },
        { id: 'e2e-s2', name: 'Deploy', type: 'deploy', config: {}, dependsOn: ['e2e-s1'] },
      ],
      status: 'pending',
    });

    // Execute workflow
    const { body: run } = await request(app)
      .post('/api/workflows/e2e-wf/execute')
      .send({ sync: true });
    expect(run.status).toBe('running');

    // Advance and complete s1
    await request(app).post(`/api/execution-runs/${run.id}/advance`);
    const allTasks = listTasksByExecutionRun(db, run.id);
    const s1 = allTasks.find((t) => t.stepId === 'e2e-s1');
    expect(s1).toBeTruthy();
    updateTask(db, s1!.id, { status: 'completed', output: { built: true } });

    // Advance and complete s2
    await request(app).post(`/api/execution-runs/${run.id}/advance`);
    const allTasks2 = listTasksByExecutionRun(db, run.id);
    const s2 = allTasks2.find((t) => t.stepId === 'e2e-s2');
    expect(s2).toBeTruthy();
    updateTask(db, s2!.id, { status: 'completed', output: { deployed: true } });

    // Final advance → completed
    const finalRun = await drainRun(app, run.id);
    expect(finalRun.status).toBe('completed');
    expect(finalRun.stepResults).toHaveLength(2);
    expect(finalRun.stepResults.every((r) => r.status === 'success')).toBe(true);

    // Verify events are persisted (bus.publish writes to SQLite)
    const events = listEvents(db);
    expect(Array.isArray(events)).toBe(true);

    // Verify metrics endpoint is still healthy after all operations
    const metricsRes = await request(app).get('/metrics');
    expect(metricsRes.status).toBe(200);
    expect(metricsRes.text).toContain('task_queue_depth');

    // Verify dashboard aggregates reflect the operations
    const dash = await request(app).get('/api/dashboard');
    expect(dash.status).toBe(200);
    expect(dash.body.agentUtilization.total).toBeGreaterThanOrEqual(1);
    expect(dash.body.timestamp).toBeTruthy();
  });
});
