import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createRegistryApp } from './registry.js';
import { createDb } from '@mission-control/core';

let app: ReturnType<typeof createRegistryApp>;

beforeEach(() => {
  const db = createDb(':memory:');
  app = createRegistryApp(db);
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /agents — register
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /agents', () => {
  it('registers a new agent and returns 201', async () => {
    const res = await request(app)
      .post('/agents')
      .send({ id: 'a1', name: 'Alpha', capabilities: ['search'], status: 'idle', metadata: {} });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('a1');
    expect(res.body.name).toBe('Alpha');
    expect(res.body.capabilities).toEqual(['search']);
    expect(res.body.status).toBe('idle');
    expect(res.body.lastHeartbeatAt).toBeNull();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/agents').send({ name: 'NoId' });
    expect(res.status).toBe(400);
  });

  it('returns 409 when agent id already exists', async () => {
    await request(app).post('/agents').send({ id: 'a1', name: 'Alpha', capabilities: [], status: 'idle', metadata: {} });
    const res = await request(app).post('/agents').send({ id: 'a1', name: 'Dupe', capabilities: [], status: 'idle', metadata: {} });
    expect(res.status).toBe(409);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /agents — list
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /agents', () => {
  it('returns empty array when no agents', async () => {
    const res = await request(app).get('/agents');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns all registered agents', async () => {
    await request(app).post('/agents').send({ id: 'a1', name: 'Alpha', capabilities: ['search'], status: 'idle', metadata: {} });
    await request(app).post('/agents').send({ id: 'a2', name: 'Beta', capabilities: ['write'], status: 'busy', metadata: {} });

    const res = await request(app).get('/agents');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('filters agents by capability when ?capability= is provided', async () => {
    await request(app).post('/agents').send({ id: 'a1', name: 'Alpha', capabilities: ['search', 'write'], status: 'idle', metadata: {} });
    await request(app).post('/agents').send({ id: 'a2', name: 'Beta', capabilities: ['code-review'], status: 'idle', metadata: {} });
    await request(app).post('/agents').send({ id: 'a3', name: 'Gamma', capabilities: ['write', 'read'], status: 'idle', metadata: {} });

    const res = await request(app).get('/agents?capability=write');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((a: { id: string }) => a.id)).toContain('a1');
    expect(res.body.map((a: { id: string }) => a.id)).toContain('a3');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /agents/:id
// ──────────────────────────────────────────────────────────────────────────────

describe('GET /agents/:id', () => {
  it('returns an agent by id', async () => {
    await request(app).post('/agents').send({ id: 'a1', name: 'Alpha', capabilities: ['search'], status: 'idle', metadata: {} });
    const res = await request(app).get('/agents/a1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('a1');
  });

  it('returns 404 for unknown agent', async () => {
    const res = await request(app).get('/agents/unknown');
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /agents/:id — update
// ──────────────────────────────────────────────────────────────────────────────

describe('PATCH /agents/:id', () => {
  it('updates agent status', async () => {
    await request(app).post('/agents').send({ id: 'a1', name: 'Alpha', capabilities: ['search'], status: 'idle', metadata: {} });
    const res = await request(app).patch('/agents/a1').send({ status: 'busy' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('busy');
  });

  it('updates agent capabilities', async () => {
    await request(app).post('/agents').send({ id: 'a1', name: 'Alpha', capabilities: ['search'], status: 'idle', metadata: {} });
    const res = await request(app).patch('/agents/a1').send({ capabilities: ['search', 'write'] });
    expect(res.status).toBe(200);
    expect(res.body.capabilities).toEqual(['search', 'write']);
  });

  it('returns 404 when patching unknown agent', async () => {
    const res = await request(app).patch('/agents/unknown').send({ status: 'idle' });
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /agents/:id — deregister
// ──────────────────────────────────────────────────────────────────────────────

describe('DELETE /agents/:id', () => {
  it('deregisters an agent and returns 204', async () => {
    await request(app).post('/agents').send({ id: 'a1', name: 'Alpha', capabilities: [], status: 'idle', metadata: {} });
    const res = await request(app).delete('/agents/a1');
    expect(res.status).toBe(204);

    const getRes = await request(app).get('/agents/a1');
    expect(getRes.status).toBe(404);
  });

  it('returns 404 when deleting unknown agent', async () => {
    const res = await request(app).delete('/agents/unknown');
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /agents/:id/heartbeat — health ping
// ──────────────────────────────────────────────────────────────────────────────

describe('POST /agents/:id/heartbeat', () => {
  it('updates lastHeartbeatAt and returns agent', async () => {
    await request(app).post('/agents').send({ id: 'a1', name: 'Alpha', capabilities: [], status: 'idle', metadata: {} });
    const res = await request(app).post('/agents/a1/heartbeat');
    expect(res.status).toBe(200);
    expect(res.body.lastHeartbeatAt).not.toBeNull();
  });

  it('returns 404 for unknown agent', async () => {
    const res = await request(app).post('/agents/unknown/heartbeat');
    expect(res.status).toBe(404);
  });
});
