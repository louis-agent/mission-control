import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { createDb, EventBus } from '@mission-control/core';
import { createSseApp } from './sse.js';

describe('SSE event stream', () => {
  let server: http.Server;
  let bus: EventBus;
  let port: number;

  beforeEach(async () => {
    const db = createDb(':memory:');
    bus = new EventBus(db);
    const app = express();
    app.use(createSseApp(bus));
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    port = (server.address() as { port: number }).port;
  });

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('sets SSE headers on /events/stream', async () => {
    const controller = new AbortController();
    const res = await fetch(`http://localhost:${port}/events/stream`, {
      signal: controller.signal,
    });
    controller.abort();
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('delivers published events to connected client', async () => {
    const received: string[] = [];
    const controller = new AbortController();

    const streamPromise = fetch(`http://localhost:${port}/events/stream`, {
      signal: controller.signal,
    }).then(async (res) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        received.push(chunk);
        if (received.length >= 1) break;
      }
      reader.cancel();
    });

    // Small delay to let client connect
    await new Promise((r) => setTimeout(r, 50));
    bus.publish({ type: 'task.completed', source: 'test', payload: { id: 'x' } });
    await new Promise((r) => setTimeout(r, 100));
    controller.abort();

    try { await streamPromise; } catch { /* aborted */ }

    const full = received.join('');
    expect(full).toContain('task.completed');
  });

  it('filters events by ?types= query param', async () => {
    const received: string[] = [];
    const controller = new AbortController();

    const streamPromise = fetch(`http://localhost:${port}/events/stream?types=workflow.*`, {
      signal: controller.signal,
    }).then(async (res) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      // Read for a limited time
      const timeout = setTimeout(() => reader.cancel(), 300);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received.push(decoder.decode(value));
        }
      } finally {
        clearTimeout(timeout);
      }
    });

    await new Promise((r) => setTimeout(r, 50));
    // Publish task event (should be filtered out)
    bus.publish({ type: 'task.completed', source: 'test', payload: {} });
    await new Promise((r) => setTimeout(r, 200));
    controller.abort();

    try { await streamPromise; } catch { /* aborted */ }

    // task.completed should NOT appear in stream filtered for workflow.*
    const full = received.join('');
    expect(full).not.toContain('task.completed');
  });
});
