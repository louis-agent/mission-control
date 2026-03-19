import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDb, createAgent, createTask, createWorkflow } from '@mission-control/core';
import { createDashboardApp } from './dashboard.js';

function makeApp() {
  const db = createDb(':memory:');
  const app = express();
  app.use(createDashboardApp(db));
  return { app, db };
}

describe('dashboard router', () => {
  let app: express.Express;
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    ({ app, db } = makeApp());
  });

  it('GET /dashboard returns expected shape', async () => {
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      agentUtilization: expect.objectContaining({
        total: expect.any(Number),
        idle: expect.any(Number),
        busy: expect.any(Number),
        offline: expect.any(Number),
      }),
      taskThroughput: expect.objectContaining({
        lastHour: expect.any(Number),
        lastDay: expect.any(Number),
      }),
      failureRate: expect.any(Number),
      queueDepth: expect.any(Number),
      activeWorkflows: expect.any(Number),
      activeExecutionRuns: expect.any(Number),
      timeSeries: expect.objectContaining({
        completedTasks: expect.any(Array),
        failedTasks: expect.any(Array),
      }),
    });
  });

  it('GET /dashboard reflects agent status counts', async () => {
    createAgent(db, { id: 'a1', name: 'Idle', capabilities: [], status: 'idle', metadata: {} });
    createAgent(db, { id: 'a2', name: 'Busy', capabilities: [], status: 'busy', metadata: {} });
    createAgent(db, { id: 'a3', name: 'Off', capabilities: [], status: 'offline', metadata: {} });

    const res = await request(app).get('/dashboard');
    expect(res.body.agentUtilization).toMatchObject({ total: 3, idle: 1, busy: 1, offline: 1 });
  });

  it('GET /dashboard reflects queue depth', async () => {
    createTask(db, {
      id: 't1',
      title: 'task1',
      description: '',
      status: 'pending',
      requiredCapabilities: [],
      assigneeAgentId: null,
      workflowId: null,
      dependencies: [],
      input: {},
      output: {},
      errorMessage: null,
    });

    const res = await request(app).get('/dashboard');
    expect(res.body.queueDepth).toBe(1);
  });

  it('GET /dashboard time series has 24 hourly buckets', async () => {
    const res = await request(app).get('/dashboard');
    expect(res.body.timeSeries.completedTasks).toHaveLength(24);
    expect(res.body.timeSeries.failedTasks).toHaveLength(24);
  });
});
