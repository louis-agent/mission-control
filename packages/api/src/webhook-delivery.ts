import { createHmac } from 'crypto';
import type { Event } from '@mission-control/core';
import { logger } from './logger.js';

export interface WebhookTarget {
  id: string;
  url: string;
  secret: string;
}

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;

function sign(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

async function attemptDelivery(target: WebhookTarget, body: string, sig: string): Promise<void> {
  const res = await fetch(target.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': sig,
      'X-Webhook-Id': target.id,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

export async function deliverWebhook(target: WebhookTarget, event: Event): Promise<void> {
  const body = JSON.stringify({ webhookId: target.id, event });
  const sig = sign(target.secret, body);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await attemptDelivery(target, body, sig);
      logger.info({ webhookId: target.id, eventType: event.type, attempt }, 'webhook delivered');
      return;
    } catch (err) {
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      logger.warn(
        { webhookId: target.id, eventType: event.type, attempt, err, nextDelayMs: delay },
        'webhook delivery failed, retrying',
      );
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  logger.error(
    { webhookId: target.id, eventType: event.type },
    'webhook delivery exhausted all retries',
  );
}

export async function fireWebhooks(targets: WebhookTarget[], event: Event): Promise<void> {
  await Promise.allSettled(targets.map((t) => deliverWebhook(t, event)));
}
