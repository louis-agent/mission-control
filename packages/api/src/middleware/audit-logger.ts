import type { Response, NextFunction } from 'express';
import { createAuditLogEntry, type DB } from '@mission-control/core';
import type { AuthenticatedRequest } from './auth.js';

/**
 * Infer a resource type from the request path (e.g. "/agents/123" → "agents").
 */
function inferResourceType(path: string): string {
  const parts = path.replace(/^\//, '').split('/');
  return parts[0] ?? 'unknown';
}

/**
 * Infer a resource id from the request path (e.g. "/agents/123" → "123").
 * Returns null for collection-level routes.
 */
function inferResourceId(path: string): string | null {
  const parts = path.replace(/^\//, '').split('/');
  return parts.length >= 2 && parts[1] ? parts[1] : null;
}

/**
 * Infer a human-readable action from the HTTP method + path.
 */
function inferAction(method: string, path: string): string {
  const parts = path.replace(/^\//, '').split('/');
  const collection = parts[0] ?? 'unknown';
  const subAction = parts[2]; // e.g. "start", "complete"

  if (subAction) return `${collection}.${subAction}`;

  switch (method.toUpperCase()) {
    case 'POST': return parts[1] ? `${collection}.create` : `${collection}.create`;
    case 'PATCH': return `${collection}.update`;
    case 'PUT': return `${collection}.replace`;
    case 'DELETE': return `${collection}.delete`;
    default: return `${collection}.read`;
  }
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Middleware that logs all state-changing requests to the audit log.
 * Must be used after createAuthMiddleware so req.apiKey is available.
 */
export function createAuditLoggerMiddleware(db: DB) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    // Log after the response is sent so we can capture status
    res.on('finish', () => {
      // Only log successful mutations (2xx)
      if (res.statusCode < 200 || res.statusCode >= 300) return;

      const key = req.apiKey;
      createAuditLogEntry(db, {
        actorId: key?.id ?? null,
        actorType: key?.agentId ? 'agent' : 'user',
        action: inferAction(req.method, req.path),
        resourceType: inferResourceType(req.path),
        resourceId: inferResourceId(req.path),
        metadata: { method: req.method, path: req.path, status: res.statusCode },
        timestamp: new Date(),
      });
    });

    next();
  };
}
