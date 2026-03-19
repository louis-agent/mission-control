import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { type Application, type Request, type Response } from 'express';
import type { EventBus } from '@mission-control/core';

export interface GitHubAppConfig {
  webhookSecret: string;
}

function verifySignature(secret: string, body: Buffer, signature: string): boolean {
  if (!signature.startsWith('sha256=')) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function createGitHubApp(eventBus: EventBus, config: GitHubAppConfig): Application {
  const app = express();

  // Use raw body for HMAC verification on this specific route
  app.use('/integrations/github/webhook', express.raw({ type: 'application/json' }));

  app.post('/integrations/github/webhook', async (req: Request, res: Response) => {
    const signature = String(req.headers['x-hub-signature-256'] ?? '');
    const event = String(req.headers['x-github-event'] ?? 'unknown');
    const rawBody = req.body as Buffer;

    if (!verifySignature(config.webhookSecret, rawBody, signature)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody.toString()) as Record<string, unknown>;
    } catch { /* malformed JSON — proceed with empty payload */ }

    await eventBus.publish({
      type: `github.${event}`,
      source: 'github',
      payload: { event, ...payload },
    });

    res.json({ received: true, event });
  });

  return app;
}
