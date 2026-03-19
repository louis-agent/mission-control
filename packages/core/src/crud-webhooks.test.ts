import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from './db.js';
import {
  createWebhook,
  getWebhookById,
  listWebhooks,
  updateWebhook,
  deleteWebhook,
} from './crud-webhooks.js';

describe('crud-webhooks', () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    db = createDb(':memory:');
  });

  it('creates and retrieves a webhook', () => {
    const wh = createWebhook(db, {
      id: 'wh-1',
      url: 'https://example.com/hook',
      events: ['task.completed', 'workflow.failed'],
      secret: 'supersecret',
      active: true,
    });
    expect(wh.id).toBe('wh-1');
    expect(wh.url).toBe('https://example.com/hook');
    expect(wh.events).toEqual(['task.completed', 'workflow.failed']);
    expect(wh.secret).toBe('supersecret');
    expect(wh.active).toBe(true);
    expect(wh.createdAt).toBeInstanceOf(Date);
  });

  it('lists webhooks', () => {
    createWebhook(db, { id: 'wh-1', url: 'https://a.com', events: ['task.*'], secret: 's1', active: true });
    createWebhook(db, { id: 'wh-2', url: 'https://b.com', events: ['workflow.*'], secret: 's2', active: false });
    expect(listWebhooks(db)).toHaveLength(2);
  });

  it('updates a webhook', () => {
    createWebhook(db, { id: 'wh-1', url: 'https://a.com', events: ['task.*'], secret: 's', active: true });
    const updated = updateWebhook(db, 'wh-1', { active: false });
    expect(updated?.active).toBe(false);
  });

  it('deletes a webhook', () => {
    createWebhook(db, { id: 'wh-1', url: 'https://a.com', events: ['task.*'], secret: 's', active: true });
    const deleted = deleteWebhook(db, 'wh-1');
    expect(deleted).toBe(true);
    expect(getWebhookById(db, 'wh-1')).toBeNull();
  });

  it('returns null for missing webhook', () => {
    expect(getWebhookById(db, 'missing')).toBeNull();
  });
});
