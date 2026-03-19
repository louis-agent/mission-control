import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createWorkflowRunnerApp } from './workflow-runner.js';
import { createDb, createAgent, createWorkflow, updateTask, listTasksByExecutionRun } from '@mission-control/core';
import type { DB } from '@mission-control/core';

let db: DB;
let app: ReturnType<typeof createWorkflowRunnerApp>;

beforeEach(() => {
  db = createDb(':memory:');
  app = createWorkflowRunnerApp(db);

  createAgent(db, {
    id: 'agent-1',
    name: 'Worker',
    capabilities: ['build', 'test', 'deploy'],
    status: 'idle',
    metadata: {},
  });
});

const simpleWorkflow = () =>
  createWorkflow(db, {
    id: 'wf-1',
    name: 'CI Pipeline',
    steps: [
      { id: 's1', name: 'Build', type: 'build', config: {} },
      { id: 's2', name: 'Test', type: 'test', config: {}, dependsOn: ['s1'] },
    ],
    status: 'pending',
  });

// ──────────────────────────────────────────────────────────────────────────────
// POST /workflows/:id/execute
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /workflows/:id/execute', () => {
  it('starts execution and returns 201 with run', async () => {
    simpleWorkflow();
    const res = await request(app).post("/workflows/wf-1/execute").send({ sync: true });

    expect(res.status).toBe(201);
    expect(res.body.workflowId).toBe('wf-1');
    expect(res.body.status).toBe('running');
    expect(res.body.id).toBeTruthy();
    expect(res.body.startedAt).toBeTruthy();
  });

  it('returns 404 for unknown workflow', async () => {
    const res = await request(app).post("/workflows/unknown/execute").send({ sync: true });
    expect(res.status).toBe(404);
  });

  it('returns 422 when workflow validation fails', async () => {
    createWorkflow(db, {
      id: 'wf-invalid',
      name: 'Bad Workflow',
      steps: [
        { id: 's1', name: 'Step', type: 'gpu', config: {}, requiredCapabilities: ['gpu-compute'] },
      ],
      status: 'pending',
    });
    const res = await request(app).post("/workflows/wf-invalid/execute").send({ sync: true });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/validation failed/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /execution-runs/:id
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /execution-runs/:id', () => {
  it('returns the run with stepResults', async () => {
    simpleWorkflow();
    const { body: run } = await request(app).post("/workflows/wf-1/execute").send({ sync: true });

    const res = await request(app).get(`/execution-runs/${run.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(run.id);
    expect(res.body.stepResults).toEqual([]);
  });

  it('returns 404 for unknown run', async () => {
    const res = await request(app).get('/execution-runs/nonexistent');
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /execution-runs/:id/advance
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /execution-runs/:id/advance', () => {
  it('advances run to completed when all steps done', async () => {
    simpleWorkflow();
    const { body: run } = await request(app).post("/workflows/wf-1/execute").send({ sync: true });

    // Complete s1
    const tasks = listTasksByExecutionRun(db, run.id);
    const s1 = tasks.find((t) => t.stepId === 's1')!;
    updateTask(db, s1.id, { status: 'completed', output: { built: true } });

    const advance1 = await request(app).post(`/execution-runs/${run.id}/advance`).send();
    expect(advance1.status).toBe(200);
    expect(advance1.body.status).toBe('running'); // s2 still pending

    // Complete s2
    const allTasks = listTasksByExecutionRun(db, run.id);
    const s2 = allTasks.find((t) => t.stepId === 's2')!;
    updateTask(db, s2.id, { status: 'completed', output: { tested: true } });

    const advance2 = await request(app).post(`/execution-runs/${run.id}/advance`).send();
    expect(advance2.status).toBe(200);
    expect(advance2.body.status).toBe('completed');
    expect(advance2.body.stepResults).toHaveLength(2);
  });

  it('returns 404 for unknown run', async () => {
    const res = await request(app).post('/execution-runs/nonexistent/advance').send();
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /execution-runs/:id/cancel
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /execution-runs/:id/cancel', () => {
  it('cancels a running execution', async () => {
    simpleWorkflow();
    const { body: run } = await request(app).post("/workflows/wf-1/execute").send({ sync: true });

    const res = await request(app).post(`/execution-runs/${run.id}/cancel`).send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.cancelledAt).toBeTruthy();
  });

  it('returns 404 for unknown run', async () => {
    const res = await request(app).post('/execution-runs/nonexistent/cancel').send();
    expect(res.status).toBe(404);
  });

  it('returns 409 when cancelling a completed run', async () => {
    simpleWorkflow();
    const { body: run } = await request(app).post("/workflows/wf-1/execute").send({ sync: true });

    const tasks = listTasksByExecutionRun(db, run.id);
    updateTask(db, tasks[0].id, { status: 'completed', output: {} });
    await request(app).post(`/execution-runs/${run.id}/advance`).send();

    const allTasks = listTasksByExecutionRun(db, run.id);
    const s2 = allTasks.find((t) => t.stepId === 's2')!;
    updateTask(db, s2.id, { status: 'completed', output: {} });
    await request(app).post(`/execution-runs/${run.id}/advance`).send();

    const res = await request(app).post(`/execution-runs/${run.id}/cancel`).send();
    expect(res.status).toBe(409);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /workflows/:id/validate
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /workflows/:id/validate', () => {
  it('returns valid:true for a sound workflow', async () => {
    simpleWorkflow();
    const res = await request(app).get('/workflows/wf-1/validate');
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.errors).toEqual([]);
  });

  it('returns valid:false with errors for a bad workflow', async () => {
    createWorkflow(db, {
      id: 'wf-bad',
      name: 'Bad',
      steps: [
        { id: 's1', name: 'A', type: 'a', config: {}, dependsOn: ['s2'] },
        { id: 's2', name: 'B', type: 'b', config: {}, dependsOn: ['s1'] },
      ],
      status: 'pending',
    });
    const res = await request(app).get('/workflows/wf-bad/validate');
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('returns 404 for unknown workflow', async () => {
    const res = await request(app).get('/workflows/nonexistent/validate');
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Approval gate API endpoints
// ──────────────────────────────────────────────────────────────────────────────

describe('Approval gate endpoints', () => {
  const approvalWorkflow = () =>
    createWorkflow(db, {
      id: 'wf-approval',
      name: 'Approval Flow',
      steps: [
        { id: 's1', name: 'Build', type: 'build', config: {} },
        { id: 's2', name: 'Gate', type: 'approval', config: {}, dependsOn: ['s1'] },
        { id: 's3', name: 'Deploy', type: 'deploy', config: {}, dependsOn: ['s2'] },
      ],
      status: 'pending',
    });

  async function reachApprovalGate() {
    approvalWorkflow();
    const { body: run } = await request(app).post("/workflows/wf-approval/execute").send({ sync: true });
    const tasks = listTasksByExecutionRun(db, run.id);
    const s1 = tasks.find((t) => t.stepId === 's1')!;
    updateTask(db, s1.id, { status: 'completed', output: {} });
    await request(app).post(`/execution-runs/${run.id}/advance`).send();
    return run;
  }

  it('POST /execution-runs/:id/steps/:stepId/approve resumes execution', async () => {
    const run = await reachApprovalGate();

    const approveRes = await request(app)
      .post(`/execution-runs/${run.id}/steps/s2/approve`)
      .send();
    expect(approveRes.status).toBe(200);

    // Advance again — s3 should now be scheduled
    await request(app).post(`/execution-runs/${run.id}/advance`).send();
    const tasks = listTasksByExecutionRun(db, run.id);
    const s3 = tasks.find((t) => t.stepId === 's3');
    expect(s3).toBeDefined();
  });

  it('POST /execution-runs/:id/steps/:stepId/reject fails the run', async () => {
    const run = await reachApprovalGate();

    const rejectRes = await request(app)
      .post(`/execution-runs/${run.id}/steps/s2/reject`)
      .send({ reason: 'Not ready' });
    expect(rejectRes.status).toBe(200);

    const advanceRes = await request(app).post(`/execution-runs/${run.id}/advance`).send();
    expect(advanceRes.body.status).toBe('failed');
  });

  it('returns 404 for unknown run in approve', async () => {
    const res = await request(app).post('/execution-runs/nope/steps/s1/approve').send();
    expect(res.status).toBe(404);
  });

  it('returns 409 when step is not awaiting approval', async () => {
    simpleWorkflow();
    const { body: run } = await request(app).post("/workflows/wf-1/execute").send({ sync: true });
    const res = await request(app).post(`/execution-runs/${run.id}/steps/s1/approve`).send();
    expect(res.status).toBe(409);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Timeout enforcement
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /execution-runs/check-timeouts', () => {
  it('fails timed-out tasks and advances affected runs', async () => {
    // Create a workflow with a per-step timeout
    createWorkflow(db, {
      id: 'wf-timeout',
      name: 'Timeout Flow',
      steps: [
        { id: 's1', name: 'Slow', type: 'build', config: {}, timeoutMs: 1 }, // 1ms timeout
      ],
      status: 'pending',
    });

    const { body: run } = await request(app).post("/workflows/wf-timeout/execute").send({ sync: true });

    // Wait briefly so timeout fires
    await new Promise((r) => setTimeout(r, 5));

    const res = await request(app).post('/execution-runs/check-timeouts').send();
    expect(res.status).toBe(200);
    expect(res.body.timedOutTasks).toBeGreaterThanOrEqual(1);

    // Run should be failed after advance
    await request(app).post(`/execution-runs/${run.id}/advance`).send();
    const runRes = await request(app).get(`/execution-runs/${run.id}`);
    expect(runRes.body.status).toBe('failed');
  });

  it('cancels timed-out execution runs', async () => {
    createWorkflow(db, {
      id: 'wf-run-timeout',
      name: 'Run Timeout Flow',
      steps: [{ id: 's1', name: 'Step', type: 'build', config: {} }],
      status: 'pending',
    });

    const { body: run } = await request(app)
      .post('/workflows/wf-run-timeout/execute')
      .send({ timeoutMs: 1, sync: true });

    await new Promise((r) => setTimeout(r, 5));

    const res = await request(app).post('/execution-runs/check-timeouts').send();
    expect(res.status).toBe(200);
    expect(res.body.timedOutRuns).toBeGreaterThanOrEqual(1);

    const runRes = await request(app).get(`/execution-runs/${run.id}`);
    expect(runRes.body.status).toBe('cancelled');
  });
});
