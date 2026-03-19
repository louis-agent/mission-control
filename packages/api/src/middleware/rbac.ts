import type { Response, NextFunction } from 'express';
import type { ApiKeyRole } from '@mission-control/core';
import type { AuthenticatedRequest } from './auth.js';

// Role hierarchy: higher index = more permissions
const ROLE_LEVELS: Record<ApiKeyRole, number> = {
  viewer: 0,
  agent: 1,
  operator: 2,
  admin: 3,
};

/** Returns true if the actor's role meets or exceeds the required role. */
export function hasRole(actorRole: ApiKeyRole, required: ApiKeyRole): boolean {
  return ROLE_LEVELS[actorRole] >= ROLE_LEVELS[required];
}

/**
 * Middleware factory that requires the authenticated caller to have at least `minRole`.
 * Must be used after createAuthMiddleware.
 */
export function requireRole(minRole: ApiKeyRole) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const role = req.apiKey?.role;
    if (!role || !hasRole(role, minRole)) {
      res.status(403).json({ error: `Requires '${minRole}' role or higher` });
      return;
    }
    next();
  };
}
