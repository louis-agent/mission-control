import type { Request, Response, NextFunction } from 'express';
import { getApiKeyByPlaintext, type DB } from '@mission-control/core';
import type { ApiKey } from '@mission-control/core';

export interface AuthenticatedRequest extends Request {
  apiKey?: ApiKey;
}

/**
 * Validates the Bearer token from the Authorization header against stored API keys.
 * Attaches the resolved ApiKey to req.apiKey on success.
 * Returns 401 if missing or invalid.
 */
export function createAuthMiddleware(db: DB) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({ error: 'Missing API key' });
      return;
    }

    const key = getApiKeyByPlaintext(db, token);
    if (!key) {
      res.status(401).json({ error: 'Invalid or revoked API key' });
      return;
    }

    req.apiKey = key;
    next();
  };
}
