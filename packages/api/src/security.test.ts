import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createDb, generateApiKey, createApiKey } from '@mission-control/core';
import { createAuthMiddleware } from './middleware/auth.js';
import { requireRole } from './middleware/rbac.js';
import { RateLimiter } from './middleware/rate-limiter.js';
import { createApiKeysApp } from './api-keys.js';
import { createAuditLogApp } from './audit-log.js';
import type { AuthenticatedRequest } from './middleware/auth.js';
import type { Response, NextFunction } from 'express';

function buildApp() {
  const db = createDb(':memory:');
  const app = express();
  app.use(express.json());
  app.use(createAuthMiddleware(db));
  app.use(createApiKeysApp(db));
  app.use(createAuditLogApp(db));
  app.get('/whoami', (req: AuthenticatedRequest, res: Response) => {
    res.json({ keyId: req.apiKey?.id, role: req.apiKey?.role });
  });
  return { app, db };
}

describe('Auth middleware', () => {
  it('rejects missing Authorization header with 401', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/whoami');
    expect(res.status).toBe(401);
  });

  it('rejects non-Bearer scheme with 401', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/whoami').set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
  });

  it('rejects unknown key with 401', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/whoami').set('Authorization', 'Bearer mc_invalid_key');
    expect(res.status).toBe(401);
  });

  it('accepts a valid API key and attaches it to request', async () => {
    const { app, db } = buildApp();
    const { plaintext, hashed } = generateApiKey();
    createApiKey(db, {
      id: 'key-1',
      name: 'Test',
      hashedKey: hashed,
      agentId: null,
      role: 'admin',
      expiresAt: null,
      revokedAt: null,
    });

    const res = await request(app).get('/whoami').set('Authorization', `Bearer ${plaintext}`);
    expect(res.status).toBe(200);
    expect(res.body.keyId).toBe('key-1');
    expect(res.body.role).toBe('admin');
  });

  it('rejects a revoked API key with 401', async () => {
    const { app, db } = buildApp();
    const { plaintext, hashed } = generateApiKey();
    createApiKey(db, {
      id: 'key-rev',
      name: 'Revoked',
      hashedKey: hashed,
      agentId: null,
      role: 'viewer',
      expiresAt: null,
      revokedAt: new Date(), // already revoked
    });

    const res = await request(app).get('/whoami').set('Authorization', `Bearer ${plaintext}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired API key with 401', async () => {
    const { app, db } = buildApp();
    const { plaintext, hashed } = generateApiKey();
    createApiKey(db, {
      id: 'key-exp',
      name: 'Expired',
      hashedKey: hashed,
      agentId: null,
      role: 'viewer',
      expiresAt: new Date(Date.now() - 1000), // already expired
      revokedAt: null,
    });

    const res = await request(app).get('/whoami').set('Authorization', `Bearer ${plaintext}`);
    expect(res.status).toBe(401);
  });
});

describe('RBAC middleware', () => {
  it('allows admin to access admin-only route', async () => {
    const { app, db } = buildApp();
    const { plaintext, hashed } = generateApiKey();
    createApiKey(db, {
      id: 'admin-key',
      name: 'Admin',
      hashedKey: hashed,
      agentId: null,
      role: 'admin',
      expiresAt: null,
      revokedAt: null,
    });

    // POST /api-keys requires admin
    const res = await request(app)
      .post('/api-keys')
      .set('Authorization', `Bearer ${plaintext}`)
      .send({ name: 'new-key', role: 'viewer' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('new-key');
    expect(res.body.plaintext).toBeDefined();
  });

  it('denies viewer access to admin-only route with 403', async () => {
    const { app, db } = buildApp();
    const { plaintext, hashed } = generateApiKey();
    createApiKey(db, {
      id: 'viewer-key',
      name: 'Viewer',
      hashedKey: hashed,
      agentId: null,
      role: 'viewer',
      expiresAt: null,
      revokedAt: null,
    });

    const res = await request(app)
      .post('/api-keys')
      .set('Authorization', `Bearer ${plaintext}`)
      .send({ name: 'new-key' });

    expect(res.status).toBe(403);
  });
});

describe('RateLimiter', () => {
  it('allows requests within the limit', () => {
    const limiter = new RateLimiter({ viewer: 3 });
    expect(limiter.allow('key-1', 'viewer')).toBe(true);
    expect(limiter.allow('key-1', 'viewer')).toBe(true);
    expect(limiter.allow('key-1', 'viewer')).toBe(true);
  });

  it('blocks requests exceeding the limit', () => {
    const limiter = new RateLimiter({ viewer: 2 });
    limiter.allow('key-1', 'viewer');
    limiter.allow('key-1', 'viewer');
    expect(limiter.allow('key-1', 'viewer')).toBe(false);
  });

  it('tracks different keys independently', () => {
    const limiter = new RateLimiter({ viewer: 2 });
    limiter.allow('key-A', 'viewer');
    limiter.allow('key-A', 'viewer');
    // key-B is independent
    expect(limiter.allow('key-B', 'viewer')).toBe(true);
  });
});

describe('API key management routes', () => {
  it('returns 400 when name is missing', async () => {
    const { app, db } = buildApp();
    const { plaintext, hashed } = generateApiKey();
    createApiKey(db, {
      id: 'adm',
      name: 'Admin',
      hashedKey: hashed,
      agentId: null,
      role: 'admin',
      expiresAt: null,
      revokedAt: null,
    });

    const res = await request(app)
      .post('/api-keys')
      .set('Authorization', `Bearer ${plaintext}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('can revoke a key via DELETE', async () => {
    const { app, db } = buildApp();
    const { plaintext, hashed } = generateApiKey();
    createApiKey(db, {
      id: 'adm2',
      name: 'Admin',
      hashedKey: hashed,
      agentId: null,
      role: 'admin',
      expiresAt: null,
      revokedAt: null,
    });

    // Create a key to revoke
    const createRes = await request(app)
      .post('/api-keys')
      .set('Authorization', `Bearer ${plaintext}`)
      .send({ name: 'to-revoke', role: 'viewer' });
    expect(createRes.status).toBe(201);
    const keyId = createRes.body.id as string;

    // Revoke it
    const revokeRes = await request(app)
      .delete(`/api-keys/${keyId}`)
      .set('Authorization', `Bearer ${plaintext}`);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.revokedAt).toBeTruthy();
  });
});
