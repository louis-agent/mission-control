import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  createAgent,
  getAgentById,
  updateAgent,
  deleteAgent,
  heartbeatAgent,
  type DB,
} from '@mission-control/core';
import { CreateAgentSchema, UpdateAgentSchema } from './validation.js';
import {
  cachedListAgents,
  cachedGetAgentById,
  cachedListAgentsByCapability,
  invalidateAgentCache,
} from './cache.js';

function replyZodError(res: Response, err: ZodError): void {
  res.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: err.issues },
  });
}

export function createRegistryApp(db: DB): Application {
  const app = express();
  app.use(express.json());

  // POST /agents — register a new agent
  app.post('/agents', (req: Request, res: Response, next: NextFunction) => {
    const parsed = CreateAgentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      replyZodError(res, parsed.error);
      return;
    }

    const { id, name, capabilities, status, metadata } = parsed.data;

    if (cachedGetAgentById(db, id)) {
      res.status(409).json({ error: `Agent with id '${id}' already exists` });
      return;
    }

    const agent = createAgent(db, {
      id,
      name,
      capabilities: capabilities ?? [],
      status: status ?? 'idle',
      metadata: metadata ?? {},
    });
    invalidateAgentCache(db, id);

    res.status(201).json(agent);
  });

  // GET /agents — list all agents, optional ?capability= filter
  app.get('/agents', (req: Request, res: Response, next: NextFunction) => {
    const { capability } = req.query as { capability?: string };
    try {
      const result = capability
        ? cachedListAgentsByCapability(db, capability)
        : cachedListAgents(db);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /agents/:id — get agent by id
  app.get('/agents/:id', (req: Request<{ id: string }>, res: Response) => {
    const agent = cachedGetAgentById(db, req.params.id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(agent);
  });

  // PATCH /agents/:id — update agent fields
  app.patch('/agents/:id', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const existing = cachedGetAgentById(db, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const parsed = UpdateAgentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      replyZodError(res, parsed.error);
      return;
    }

    const updated = updateAgent(db, req.params.id, parsed.data);
    invalidateAgentCache(db, req.params.id);
    res.json(updated);
  });

  // DELETE /agents/:id — deregister agent
  app.delete('/agents/:id', (req: Request<{ id: string }>, res: Response) => {
    const deleted = deleteAgent(db, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    invalidateAgentCache(db, req.params.id);
    res.status(204).send();
  });

  // POST /agents/:id/heartbeat — health check ping
  app.post('/agents/:id/heartbeat', (req: Request<{ id: string }>, res: Response) => {
    const agent = heartbeatAgent(db, req.params.id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    invalidateAgentCache(db, req.params.id);
    res.json(agent);
  });

  return app;
}
