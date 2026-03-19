import { randomUUID } from 'crypto';
import express, { type Application, type Request, type Response } from 'express';
import {
  generateApiKey,
  createApiKey,
  listApiKeys,
  getApiKeyById,
  revokeApiKey,
  type DB,
} from '@mission-control/core';
import type { AuthenticatedRequest } from './middleware/auth.js';
import { requireRole } from './middleware/rbac.js';

export function createApiKeysApp(db: DB): Application {
  const app = express();
  app.use(express.json());

  // POST /api-keys — generate a new API key (admin only)
  app.post('/api-keys', requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
    const { name, agentId, role, expiresAt } = req.body as {
      name?: string;
      agentId?: string;
      role?: string;
      expiresAt?: string;
    };

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const validRoles = ['admin', 'operator', 'agent', 'viewer'];
    const keyRole = (role ?? 'viewer') as 'admin' | 'operator' | 'agent' | 'viewer';
    if (!validRoles.includes(keyRole)) {
      res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
      return;
    }

    const { plaintext, hashed } = generateApiKey();
    const key = createApiKey(db, {
      id: randomUUID(),
      name,
      hashedKey: hashed,
      agentId: agentId ?? null,
      role: keyRole,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      revokedAt: null,
    });

    // Return plaintext only once — never stored
    res.status(201).json({ ...key, plaintext });
  });

  // GET /api-keys — list all API keys (admin only, hashed keys shown)
  app.get('/api-keys', requireRole('admin'), (_req: Request, res: Response) => {
    res.json(listApiKeys(db));
  });

  // GET /api-keys/:id — get a single key (admin only)
  app.get('/api-keys/:id', requireRole('admin'), (req: Request<{ id: string }>, res: Response) => {
    const key = getApiKeyById(db, req.params.id);
    if (!key) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }
    res.json(key);
  });

  // DELETE /api-keys/:id — revoke a key (admin only)
  app.delete('/api-keys/:id', requireRole('admin'), (req: Request<{ id: string }>, res: Response) => {
    const revoked = revokeApiKey(db, req.params.id);
    if (!revoked) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }
    res.json(revoked);
  });

  return app;
}
