import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDb, EventBus } from '@mission-control/core';
import { createSlackApp, postToSlack } from './slack.js';

function makeApp() {
  const db = createDb(':memory:');
  const eventBus = new EventBus(db);
  const app = express();
  // Pass empty signingSecret so signature verification is skipped in tests
  app.use(createSlackApp(eventBus, { signingSecret: '' }));
  return { app, eventBus };
}

describe('Slack slash command receiver', () => {
  it('POST /integrations/slack/command handles a slash command', async () => {
    const { app, eventBus } = makeApp();
    const received: unknown[] = [];
    eventBus.subscribe('slack.*', (e) => received.push(e));

    const res = await request(app)
      .post('/integrations/slack/command')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('X-Slack-Request-Timestamp', '1234567890')
      .set('X-Slack-Signature', 'v0=skip') // signature verification is tested separately
      .send('command=%2Fmc-status&text=agents&user_id=U123');

    expect(res.status).toBe(200);
    expect(res.body.response_type).toBe('in_channel');
  });
});

describe('postToSlack', () => {
  it('posts to Slack webhook URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    await postToSlack('https://hooks.slack.com/services/test', { text: 'hello' });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/test',
      expect.objectContaining({ method: 'POST' }),
    );
    vi.unstubAllGlobals();
  });
});
