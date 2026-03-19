import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { type Application, type Request, type Response } from 'express';
import type { EventBus } from '@mission-control/core';

export interface SlackConfig {
  signingSecret: string;
  incomingWebhookUrl?: string;
}

export interface SlackMessage {
  text: string;
  attachments?: unknown[];
  blocks?: unknown[];
}

export async function postToSlack(webhookUrl: string, message: SlackMessage): Promise<void> {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  });
}

function verifySlackSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  const base = `v0:${timestamp}:${rawBody}`;
  const expected = 'v0=' + createHmac('sha256', secret).update(base).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function parseBody(rawBody: string, contentType: string): Record<string, string> {
  if (contentType.includes('application/json')) {
    return JSON.parse(rawBody) as Record<string, string>;
  }
  return Object.fromEntries(new URLSearchParams(rawBody));
}

export function createSlackApp(eventBus: EventBus, config: SlackConfig): Application {
  const app = express();

  // Use raw body for all Slack routes (needed for signature verification)
  app.use(
    '/integrations/slack',
    express.raw({ type: ['application/json', 'application/x-www-form-urlencoded'] }),
  );

  app.post('/integrations/slack/command', async (req: Request, res: Response) => {
    const rawBody = (req.body as Buffer).toString();
    const timestamp = String(req.headers['x-slack-request-timestamp'] ?? '');
    const signature = String(req.headers['x-slack-signature'] ?? '');

    // Verify signature if signingSecret is configured
    if (
      config.signingSecret &&
      !verifySlackSignature(config.signingSecret, timestamp, rawBody, signature)
    ) {
      res.status(401).json({ error: 'Invalid Slack signature' });
      return;
    }

    const ct = String(req.headers['content-type'] ?? '');
    const body = parseBody(rawBody, ct);
    const command = String(body.command ?? '');
    const text = String(body.text ?? '');
    const userId = String(body.user_id ?? '');

    await eventBus.publish({
      type: 'slack.command',
      source: 'slack',
      payload: { command, text, userId },
    });

    res.json({
      response_type: 'in_channel',
      text: `Command received: \`${command} ${text}\` — Mission Control is processing.`,
    });
  });

  app.post('/integrations/slack/events', async (req: Request, res: Response) => {
    const rawBody = (req.body as Buffer).toString();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      /* ignore */
    }

    const { type, challenge, event } = parsed;

    if (type === 'url_verification') {
      res.json({ challenge });
      return;
    }

    if (event && typeof event === 'object') {
      const e = event as Record<string, unknown>;
      await eventBus.publish({
        type: `slack.${String(e.type ?? 'unknown')}`,
        source: 'slack',
        payload: e,
      });
    }

    res.json({ ok: true });
  });

  return app;
}
