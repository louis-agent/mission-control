import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createWorkflowRunnerApp } from './workflow-runner.js';
import { createDb, createAgent, createWorkflow } from '@mission-control/core';
import type { DB } from '@mission-control/core';

let db: DB;
let app: ReturnType<typeof createWorkflowRunnerApp>;

beforeEach(() => {
  db = createDb(':memory:');
  app = createWorkflowRunnerApp(db);

  createAgent(db, {
    id: 'agent-1',
    name: 'Worker',
    capabilities: ['build'],
    status: 'idle',
    metadata: {},
  });
});

describe('GET /execution-runs/:id/timeline', () => {
  it('returns 404 for unknown run', async () => {
    const res = await request(app).get('/execution-runs/nonexistent/timeline');
    expect(res.status).toBe(404);
  });

  it('returns timeline events for a started run', async () => {
    createWorkflow(db, {
      id: 'wf-1',
      name: 'Pipeline',
      steps: [{ id: 's1', name: 'Build', type: 'build', config: {} }],
      status: 'pending',
    });

    const execRes = await request(app).post('/workflows/wf-1/execute').send({ sync: true });
    expect(execRes.status).toBe(201);

    const runId = execRes.body.id as string;
    const res = await request(app).get(`/execution-runs/${runId}/timeline`);

    expect(res.status).toBe(200);
    expect(res.body.runId).toBe(runId);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeGreaterThan(0);

    const types = res.body.events.map((e: { type: string }) => e.type);
    expect(types).toContain('run.created');
    expect(types).toContain('run.started');
  });

  it('timeline events are sorted chronologically', async () => {
    createWorkflow(db, {
      id: 'wf-2',
      name: 'Pipeline',
      steps: [{ id: 's1', name: 'Build', type: 'build', config: {} }],
      status: 'pending',
    });

    const execRes = await request(app).post('/workflows/wf-2/execute').send({ sync: true });
    const runId = execRes.body.id as string;
    const res = await request(app).get(`/execution-runs/${runId}/timeline`);

    const timestamps = res.body.events.map((e: { timestamp: string }) => new Date(e.timestamp).getTime());
    const sorted = [...timestamps].sort((a, b) => a - b);
    expect(timestamps).toEqual(sorted);
  });

  it('each timeline event has required fields', async () => {
    createWorkflow(db, {
      id: 'wf-3',
      name: 'Pipeline',
      steps: [{ id: 's1', name: 'Build', type: 'build', config: {} }],
      status: 'pending',
    });

    const execRes = await request(app).post('/workflows/wf-3/execute').send({ sync: true });
    const runId = execRes.body.id as string;
    const res = await request(app).get(`/execution-runs/${runId}/timeline`);

    for (const event of res.body.events) {
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('detail');
    }
  });
});
