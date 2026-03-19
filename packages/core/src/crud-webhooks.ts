import { eq } from 'drizzle-orm';
import type { DB } from './db.js';
import { webhooks } from './schema.js';
import type { Webhook, CreateWebhookInput, UpdateWebhookInput } from './types.js';
import { toJson, fromJson } from './json-utils.js';

type WebhookRow = typeof webhooks.$inferSelect;

function rowToWebhook(row: WebhookRow): Webhook {
  return {
    id: row.id,
    url: row.url,
    events: fromJson<string[]>(row.events),
    secret: row.secret,
    active: row.active,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export function createWebhook(db: DB, input: CreateWebhookInput): Webhook {
  const now = new Date();
  db.insert(webhooks).values({
    id: input.id,
    url: input.url,
    events: toJson(input.events),
    secret: input.secret,
    active: input.active,
    createdAt: now,
    updatedAt: now,
  }).run();
  return getWebhookById(db, input.id)!;
}

export function getWebhookById(db: DB, id: string): Webhook | null {
  const row = db.select().from(webhooks).where(eq(webhooks.id, id)).get();
  return row ? rowToWebhook(row) : null;
}

export function listWebhooks(db: DB): Webhook[] {
  return db.select().from(webhooks).all().map(rowToWebhook);
}

export function updateWebhook(db: DB, id: string, input: UpdateWebhookInput): Webhook | null {
  const existing = getWebhookById(db, id);
  if (!existing) return null;
  const now = new Date();
  db.update(webhooks)
    .set({
      ...(input.url !== undefined && { url: input.url }),
      ...(input.events !== undefined && { events: toJson(input.events) }),
      ...(input.secret !== undefined && { secret: input.secret }),
      ...(input.active !== undefined && { active: input.active }),
      updatedAt: now,
    })
    .where(eq(webhooks.id, id))
    .run();
  return getWebhookById(db, id);
}

export function deleteWebhook(db: DB, id: string): boolean {
  const existing = getWebhookById(db, id);
  if (!existing) return false;
  db.delete(webhooks).where(eq(webhooks.id, id)).run();
  return true;
}

export function listActiveWebhooksForEvent(db: DB, eventType: string): Webhook[] {
  return listWebhooks(db).filter(
    (wh) =>
      wh.active &&
      wh.events.some((pattern) => {
        const regex = new RegExp(
          `^${pattern.split('.').map((s) => (s === '*' ? '[^.]+' : s.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&'))).join('\\.')}$`
        );
        return regex.test(eventType);
      })
  );
}
