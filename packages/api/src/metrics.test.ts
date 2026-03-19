import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDb } from '@mission-control/core';
import { createMetricsApp, register } from './metrics.js';

function makeApp() {
  const db = createDb(':memory:');
  const app = express();
  app.use(createMetricsApp(db));
  return app;
}

describe('metrics router', () => {
  let app: ReturnType<typeof makeApp>;

  beforeEach(async () => {
    // Reset registry counters between tests
    register.resetMetrics();
    app = makeApp();
  });

  it('GET /metrics returns prometheus text format', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('task_queue_depth');
    expect(res.text).toContain('agent_status_count');
    expect(res.text).toContain('active_execution_runs');
  });

  it('GET /metrics includes default Node.js metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('process_cpu_seconds_total');
  });
});
