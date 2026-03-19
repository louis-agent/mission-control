import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDb, EventBus } from '@mission-control/core';
import { createGitHubApp } from './github.js';
import { createHmac } from 'node:crypto';

function sign(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

function makeApp(secret = 'test-secret') {
  const db = createDb(':memory:');
  const eventBus = new EventBus(db);
  const app = express();
  app.use(createGitHubApp(eventBus, { webhookSecret: secret }));
  return { app, eventBus, db };
}

describe('GitHub webhook receiver', () => {
  it('POST /integrations/github/webhook returns 200 with valid signature', async () => {
    const { app } = makeApp();
    const body = JSON.stringify({ action: 'opened', pull_request: { number: 1 } });
    const sig = sign('test-secret', body);

    const res = await request(app)
      .post('/integrations/github/webhook')
      .set('X-Hub-Signature-256', sig)
      .set('X-GitHub-Event', 'pull_request')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.event).toBe('pull_request');
  });

  it('POST /integrations/github/webhook returns 401 with invalid signature', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/integrations/github/webhook')
      .set('X-Hub-Signature-256', 'sha256=invalidsig')
      .set('X-GitHub-Event', 'push')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(401);
  });

  it('emits an event to the bus on valid webhook', async () => {
    const { app, eventBus } = makeApp();
    const received: unknown[] = [];
    eventBus.subscribe('github.*', (e) => received.push(e));

    const body = JSON.stringify({ ref: 'refs/heads/main', commits: [] });
    const sig = sign('test-secret', body);

    await request(app)
      .post('/integrations/github/webhook')
      .set('X-Hub-Signature-256', sig)
      .set('X-GitHub-Event', 'push')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(received).toHaveLength(1);
  });
});
