import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDb } from '@mission-control/core';
import { createAlertsApp, evaluateAlerts } from './alerts.js';

function makeApp() {
  const db = createDb(':memory:');
  const app = express();
  app.use(express.json());
  app.use(createAlertsApp(db));
  return { app, db };
}

describe('alerts router', () => {
  let app: express.Express;
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    ({ app, db } = makeApp());
  });

  it('POST /alerts/rules creates an alert rule', async () => {
    const res = await request(app).post('/alerts/rules').send({
      name: 'High queue',
      metric: 'task_queue_depth',
      operator: 'gt',
      threshold: 100,
      webhookUrl: 'https://example.com/hook',
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('High queue');
    expect(res.body.metric).toBe('task_queue_depth');
    expect(res.body.operator).toBe('gt');
    expect(res.body.threshold).toBe(100);
  });

  it('GET /alerts/rules lists rules', async () => {
    await request(app).post('/alerts/rules').send({
      name: 'r1',
      metric: 'agent_offline_count',
      operator: 'gte',
      threshold: 1,
      webhookUrl: 'https://example.com/hook',
    });
    const res = await request(app).get('/alerts/rules');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('PATCH /alerts/rules/:id updates a rule', async () => {
    const created = await request(app).post('/alerts/rules').send({
      name: 'old',
      metric: 'task_queue_depth',
      operator: 'gt',
      threshold: 10,
      webhookUrl: 'https://example.com/hook',
    });
    const res = await request(app)
      .patch(`/alerts/rules/${created.body.id}`)
      .send({ name: 'new', threshold: 50 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('new');
    expect(res.body.threshold).toBe(50);
  });

  it('DELETE /alerts/rules/:id removes a rule', async () => {
    const created = await request(app).post('/alerts/rules').send({
      name: 'del',
      metric: 'task_queue_depth',
      operator: 'gt',
      threshold: 10,
      webhookUrl: 'https://example.com/hook',
    });
    const del = await request(app).delete(`/alerts/rules/${created.body.id}`);
    expect(del.status).toBe(204);
    const list = await request(app).get('/alerts/rules');
    expect(list.body).toHaveLength(0);
  });

  it('POST /alerts/rules returns 400 on invalid body', async () => {
    const res = await request(app).post('/alerts/rules').send({ name: 'bad' });
    expect(res.status).toBe(400);
  });

  it('GET /alerts/states returns empty array initially', async () => {
    const res = await request(app).get('/alerts/states');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('POST /alerts/evaluate runs without error', async () => {
    const res = await request(app).post('/alerts/evaluate');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ evaluated: 0, states: [] });
  });

  it('evaluateAlerts marks rule as firing when threshold exceeded', async () => {
    await request(app).post('/alerts/rules').send({
      name: 'offline',
      metric: 'agent_offline_count',
      operator: 'gte',
      threshold: 0, // always fires (0 offline >= 0)
      webhookUrl: 'https://example.com/hook',
    });

    await evaluateAlerts(db);

    const res = await request(app).get('/alerts/states');
    expect(res.body[0].status).toBe('firing');
  });
});
