import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createQueueApp } from './queue.js';
import { createDb, createAgent } from '@mission-control/core';

let app: ReturnType<typeof createQueueApp>;
let db: ReturnType<typeof createDb>;

beforeEach(() => {
  db = createDb(':memory:');
  app = createQueueApp(db);
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /tasks — submit
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /tasks', () => {
  it('submits a task and returns 201 with pending status', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'Summarise docs', requiredCapabilities: ['search'] });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Summarise docs');
    expect(res.body.status).toBe('pending');
    expect(res.body.requiredCapabilities).toEqual(['search']);
    expect(res.body.assigneeAgentId).toBeNull();
  });

  it('auto-generates an id when not provided', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Auto ID' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
  });

  it('uses provided id', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ id: 'custom-id', title: 'Custom' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('custom-id');
  });

  it('defaults requiredCapabilities to []', async () => {
    const res = await request(app).post('/tasks').send({ title: 'No caps' });
    expect(res.status).toBe(201);
    expect(res.body.requiredCapabilities).toEqual([]);
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app).post('/tasks').send({});
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /tasks — list
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /tasks', () => {
  it('returns empty array when no tasks', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns all tasks', async () => {
    await request(app).post('/tasks').send({ title: 'T1' });
    await request(app).post('/tasks').send({ title: 'T2' });
    const res = await request(app).get('/tasks');
    expect(res.body).toHaveLength(2);
  });

  it('filters tasks by status', async () => {
    await request(app).post('/tasks').send({ title: 'Pending task' });

    // Add an agent so we can dispatch
    createAgent(db, { id: 'a1', name: 'Agent', capabilities: [], status: 'idle', metadata: {} });
    await request(app).post('/tasks/dispatch');

    const pending = await request(app).get('/tasks?status=pending');
    const assigned = await request(app).get('/tasks?status=assigned');
    expect(pending.body).toHaveLength(0);
    expect(assigned.body).toHaveLength(1);
  });

  it('returns 400 for invalid status', async () => {
    const res = await request(app).get('/tasks?status=bogus');
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /tasks/:id
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /tasks/:id', () => {
  it('returns a task by id', async () => {
    await request(app).post('/tasks').send({ id: 't1', title: 'Find me' });
    const res = await request(app).get('/tasks/t1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('t1');
  });

  it('returns 404 for unknown task', async () => {
    const res = await request(app).get('/tasks/nope');
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /tasks/dispatch
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /tasks/dispatch', () => {
  it('returns dispatched:false when no pending tasks', async () => {
    const res = await request(app).post('/tasks/dispatch');
    expect(res.status).toBe(200);
    expect(res.body.dispatched).toBe(false);
    expect(res.body.task).toBeNull();
  });

  it('returns dispatched:false when no idle agents match capabilities', async () => {
    await request(app).post('/tasks').send({ title: 'T', requiredCapabilities: ['code-review'] });
    createAgent(db, { id: 'a1', name: 'Agent', capabilities: ['search'], status: 'idle', metadata: {} });

    const res = await request(app).post('/tasks/dispatch');
    expect(res.body.dispatched).toBe(false);
  });

  it('assigns task to matching idle agent (FIFO)', async () => {
    await request(app).post('/tasks').send({ id: 't1', title: 'First', requiredCapabilities: ['search'] });
    await request(app).post('/tasks').send({ id: 't2', title: 'Second', requiredCapabilities: ['search'] });
    createAgent(db, { id: 'a1', name: 'Searcher', capabilities: ['search'], status: 'idle', metadata: {} });

    const res = await request(app).post('/tasks/dispatch');
    expect(res.status).toBe(200);
    expect(res.body.dispatched).toBe(true);
    expect(res.body.task.id).toBe('t1'); // FIFO: first submitted
    expect(res.body.task.status).toBe('assigned');
    expect(res.body.task.assigneeAgentId).toBe('a1');
  });

  it('assigns task when agent has superset of requiredCapabilities', async () => {
    await request(app).post('/tasks').send({ title: 'Task', requiredCapabilities: ['search'] });
    createAgent(db, { id: 'a1', name: 'Multi', capabilities: ['search', 'write'], status: 'idle', metadata: {} });

    const res = await request(app).post('/tasks/dispatch');
    expect(res.body.dispatched).toBe(true);
    expect(res.body.task.assigneeAgentId).toBe('a1');
  });

  it('skips busy agents and uses idle ones', async () => {
    await request(app).post('/tasks').send({ title: 'T', requiredCapabilities: ['search'] });
    createAgent(db, { id: 'busy', name: 'Busy', capabilities: ['search'], status: 'busy', metadata: {} });
    createAgent(db, { id: 'idle', name: 'Idle', capabilities: ['search'], status: 'idle', metadata: {} });

    const res = await request(app).post('/tasks/dispatch');
    expect(res.body.dispatched).toBe(true);
    expect(res.body.task.assigneeAgentId).toBe('idle');
  });

  it('dispatches task with no requiredCapabilities to any idle agent', async () => {
    await request(app).post('/tasks').send({ title: 'T' });
    createAgent(db, { id: 'a1', name: 'Any', capabilities: [], status: 'idle', metadata: {} });

    const res = await request(app).post('/tasks/dispatch');
    expect(res.body.dispatched).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /tasks/:id/start
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /tasks/:id/start', () => {
  async function setupAssignedTask() {
    await request(app).post('/tasks').send({ id: 't1', title: 'T' });
    createAgent(db, { id: 'a1', name: 'A', capabilities: [], status: 'idle', metadata: {} });
    await request(app).post('/tasks/dispatch');
  }

  it('transitions assigned → running', async () => {
    await setupAssignedTask();
    const res = await request(app).post('/tasks/t1/start');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('running');
  });

  it('returns 404 for unknown task', async () => {
    const res = await request(app).post('/tasks/nope/start');
    expect(res.status).toBe(404);
  });

  it('returns 409 when task is not assigned', async () => {
    await request(app).post('/tasks').send({ id: 't1', title: 'T' });
    const res = await request(app).post('/tasks/t1/start');
    expect(res.status).toBe(409);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /tasks/:id/complete
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /tasks/:id/complete', () => {
  async function setupRunningTask() {
    await request(app).post('/tasks').send({ id: 't1', title: 'T' });
    createAgent(db, { id: 'a1', name: 'A', capabilities: [], status: 'idle', metadata: {} });
    await request(app).post('/tasks/dispatch');
    await request(app).post('/tasks/t1/start');
  }

  it('transitions running → completed with output', async () => {
    await setupRunningTask();
    const res = await request(app)
      .post('/tasks/t1/complete')
      .send({ output: { result: 'done' } });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.output).toEqual({ result: 'done' });
  });

  it('defaults output to {}', async () => {
    await setupRunningTask();
    const res = await request(app).post('/tasks/t1/complete').send({});
    expect(res.status).toBe(200);
    expect(res.body.output).toEqual({});
  });

  it('returns 404 for unknown task', async () => {
    const res = await request(app).post('/tasks/nope/complete');
    expect(res.status).toBe(404);
  });

  it('returns 409 when task is not running', async () => {
    await request(app).post('/tasks').send({ id: 't1', title: 'T' });
    const res = await request(app).post('/tasks/t1/complete');
    expect(res.status).toBe(409);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /tasks/:id/fail
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /tasks/:id/fail', () => {
  async function setupRunningTask() {
    await request(app).post('/tasks').send({ id: 't1', title: 'T' });
    createAgent(db, { id: 'a1', name: 'A', capabilities: [], status: 'idle', metadata: {} });
    await request(app).post('/tasks/dispatch');
    await request(app).post('/tasks/t1/start');
  }

  it('transitions running → failed with error message', async () => {
    await setupRunningTask();
    const res = await request(app)
      .post('/tasks/t1/fail')
      .send({ error: 'timeout' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
    expect(res.body.errorMessage).toBe('timeout');
  });

  it('defaults errorMessage to "unknown error"', async () => {
    await setupRunningTask();
    const res = await request(app).post('/tasks/t1/fail').send({});
    expect(res.status).toBe(200);
    expect(res.body.errorMessage).toBe('unknown error');
  });

  it('returns 404 for unknown task', async () => {
    const res = await request(app).post('/tasks/nope/fail');
    expect(res.status).toBe(404);
  });

  it('returns 409 when task is not running', async () => {
    await request(app).post('/tasks').send({ id: 't1', title: 'T' });
    const res = await request(app).post('/tasks/t1/fail');
    expect(res.status).toBe(409);
  });
});
