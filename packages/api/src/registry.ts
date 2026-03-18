import express, { type Application, type Request, type Response } from 'express';
import {
  createAgent,
  getAgentById,
  listAgents,
  listAgentsByCapability,
  updateAgent,
  deleteAgent,
  heartbeatAgent,
  type DB,
} from '@mission-control/core';

export function createRegistryApp(db: DB): Application {
  const app = express();
  app.use(express.json());

  // POST /agents — register a new agent
  app.post('/agents', (req: Request, res: Response) => {
    const { id, name, capabilities, status, metadata } = req.body as {
      id?: string;
      name?: string;
      capabilities?: string[];
      status?: string;
      metadata?: Record<string, unknown>;
    };

    if (!id || !name) {
      res.status(400).json({ error: 'id and name are required' });
      return;
    }

    if (getAgentById(db, id)) {
      res.status(409).json({ error: `Agent with id '${id}' already exists` });
      return;
    }

    const agent = createAgent(db, {
      id,
      name,
      capabilities: capabilities ?? [],
      status: (status as 'idle' | 'busy' | 'offline') ?? 'idle',
      metadata: metadata ?? {},
    });

    res.status(201).json(agent);
  });

  // GET /agents — list all agents, optional ?capability= filter
  app.get('/agents', (req: Request, res: Response) => {
    const { capability } = req.query as { capability?: string };
    const result = capability
      ? listAgentsByCapability(db, capability)
      : listAgents(db);
    res.json(result);
  });

  // GET /agents/:id — get agent by id
  app.get('/agents/:id', (req: Request<{ id: string }>, res: Response) => {
    const agent = getAgentById(db, req.params.id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(agent);
  });

  // PATCH /agents/:id — update agent fields
  app.patch('/agents/:id', (req: Request<{ id: string }>, res: Response) => {
    const existing = getAgentById(db, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const updated = updateAgent(db, req.params.id, req.body as Parameters<typeof updateAgent>[2]);
    res.json(updated);
  });

  // DELETE /agents/:id — deregister agent
  app.delete('/agents/:id', (req: Request<{ id: string }>, res: Response) => {
    const deleted = deleteAgent(db, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.status(204).send();
  });

  // POST /agents/:id/heartbeat — health check ping
  app.post('/agents/:id/heartbeat', (req: Request<{ id: string }>, res: Response) => {
    const agent = heartbeatAgent(db, req.params.id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(agent);
  });

  return app;
}
