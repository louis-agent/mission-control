import express, { type Application, type Request, type Response } from 'express';
import type { EventBus } from '@mission-control/core';
import type { Event } from '@mission-control/core';
import { logger } from './logger.js';

function eventMatchesFilter(event: Event, types: string[]): boolean {
  if (types.length === 0) return true;
  return types.some((pattern) => {
    const regex = new RegExp(
      `^${pattern
        .split('.')
        .map((s) => (s === '*' ? '[^.]+' : s.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')))
        .join('\\.')}$`
    );
    return regex.test(event.type);
  });
}

export function createSseApp(bus: EventBus): Application {
  const app = express();

  // GET /events/stream — Server-Sent Events stream
  // Query params:
  //   ?types=task.*,workflow.*  — comma-separated event type patterns (omit for all)
  app.get('/events/stream', (req: Request, res: Response) => {
    const rawTypes = (req.query['types'] as string | undefined) ?? '';
    const types = rawTypes
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15_000);

    const handler = (event: Event): void => {
      if (!eventMatchesFilter(event, types)) return;
      const data = JSON.stringify(event);
      res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${data}\n\n`);
    };

    // Subscribe to common event depth patterns (1-4 segments)
    const unsubs = [
      bus.subscribe('*', handler),
      bus.subscribe('*.*', handler),
      bus.subscribe('*.*.*', handler),
      bus.subscribe('*.*.*.*', handler),
    ];

    logger.info({ types }, 'SSE client connected');

    req.on('close', () => {
      clearInterval(heartbeat);
      for (const unsub of unsubs) unsub();
      logger.info({ types }, 'SSE client disconnected');
    });
  });

  return app;
}
