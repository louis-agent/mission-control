import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDb } from '@mission-control/core';
import { createWebhooksApp } from './webhooks.js';

function makeApp() {
  const db = createDb(':memory:');
  const app = express();
  app.use(express.json());
  app.use(createWebhooksApp(db));
  return app;
}

describe('webhooks router', () => {
  let app: ReturnType<typeof makeApp>;

  beforeEach(() => {
    app = makeApp();
  });

  it('POST /webhooks creates a webhook', async () => {
    const res = await request(app).post('/webhooks').send({
      url: 'https://example.com/hook',
      events: ['task.completed'],
      secret: 'mysecret123',
    });
    expect(res.status).toBe(201);
    expect(res.body.url).toBe('https://example.com/hook');
    expect(res.body.secret).toBeUndefined(); // secret must be redacted
    expect(res.body.active).toBe(true);
  });

  it('GET /webhooks lists webhooks', async () => {
    await request(app).post('/webhooks').send({ url: 'https://a.com', events: ['task.*'], secret: 'secretabc' });
    const res = await request(app).get('/webhooks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('DELETE /webhooks/:id removes a webhook', async () => {
    const create = await request(app).post('/webhooks').send({ url: 'https://a.com', events: ['task.*'], secret: 'secretabc' });
    const del = await request(app).delete(`/webhooks/${create.body.id}`);
    expect(del.status).toBe(204);
  });

  it('POST /webhooks returns 400 on invalid body', async () => {
    const res = await request(app).post('/webhooks').send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  it('GET /webhooks/:id returns 404 for missing', async () => {
    const res = await request(app).get('/webhooks/nonexistent');
    expect(res.status).toBe(404);
  });
});
