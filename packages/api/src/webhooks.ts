import { randomUUID } from 'crypto';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  createWebhook,
  getWebhookById,
  listWebhooks,
  updateWebhook,
  deleteWebhook,
  type DB,
} from '@mission-control/core';
import { CreateWebhookSchema, UpdateWebhookSchema } from './validation.js';

function replyZodError(res: Response, err: ZodError): void {
  res.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: err.issues },
  });
}

// Omit secret from API responses
function sanitize(wh: ReturnType<typeof getWebhookById>) {
  if (!wh) return null;
  const { secret: _secret, ...safe } = wh;
  return safe;
}

export function createWebhooksApp(db: DB): Application {
  const app = express();
  app.use(express.json());

  app.post('/webhooks', (req: Request, res: Response, next: NextFunction) => {
    const parsed = CreateWebhookSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      replyZodError(res, parsed.error);
      return;
    }
    try {
      const wh = createWebhook(db, {
        id: parsed.data.id ?? randomUUID(),
        url: parsed.data.url,
        events: parsed.data.events,
        secret: parsed.data.secret,
        active: parsed.data.active ?? true,
      });
      res.status(201).json(sanitize(wh));
    } catch (err) {
      next(err);
    }
  });

  app.get('/webhooks', (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(listWebhooks(db).map(sanitize));
    } catch (err) {
      next(err);
    }
  });

  app.get('/webhooks/:id', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const wh = getWebhookById(db, req.params.id);
      if (!wh) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }
      res.json(sanitize(wh));
    } catch (err) {
      next(err);
    }
  });

  app.patch('/webhooks/:id', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = UpdateWebhookSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      replyZodError(res, parsed.error);
      return;
    }
    try {
      const wh = updateWebhook(db, req.params.id, parsed.data);
      if (!wh) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }
      res.json(sanitize(wh));
    } catch (err) {
      next(err);
    }
  });

  app.delete('/webhooks/:id', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const deleted = deleteWebhook(db, req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return app;
}
