import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import { MissionControlClient, ApiError } from './index.js';

function makeStubServer() {
  const app = express();
  app.use(express.json());
  app.get('/agents', (_req, res) => res.json([{ id: 'a1', name: 'Bot', status: 'idle', capabilities: [] }]));
  app.post('/agents', (req, res) => res.status(201).json({ ...req.body, createdAt: new Date().toISOString() }));
  app.get('/tasks', (_req, res) => res.json([]));
  app.post('/tasks', (req, res) => res.status(201).json({ id: 't1', ...req.body, status: 'pending' }));
  app.get('/tasks/t1', (_req, res) => res.json({ id: 't1', title: 'Test', status: 'pending' }));
  app.get('/missing', (_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}

describe('MissionControlClient', () => {
  let server: http.Server;
  let client: MissionControlClient;

  beforeAll(async () => {
    const app = makeStubServer();
    await new Promise<void>((r) => { server = app.listen(0, r); });
    const { port } = server.address() as { port: number };
    client = new MissionControlClient({ baseUrl: `http://localhost:${port}` });
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('lists agents', async () => {
    const agents = await client.agents.list();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('a1');
  });

  it('creates an agent', async () => {
    const agent = await client.agents.create({ id: 'a2', name: 'Bot2', capabilities: [] });
    expect(agent.id).toBe('a2');
  });

  it('lists tasks', async () => {
    const tasks = await client.tasks.list();
    expect(tasks).toEqual([]);
  });

  it('submits a task', async () => {
    const task = await client.tasks.submit({ title: 'Do work' });
    expect(task.id).toBe('t1');
  });

  it('gets task by id', async () => {
    const task = await client.tasks.get('t1');
    expect(task.status).toBe('pending');
  });

  it('throws ApiError on 4xx', async () => {
    await expect(client.get('/missing')).rejects.toThrow(ApiError);
  });
});
