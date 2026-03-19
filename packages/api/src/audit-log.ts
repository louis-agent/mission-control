import express, { type Application, type Request, type Response } from 'express';
import { listAuditLog, type DB } from '@mission-control/core';
import { requireRole } from './middleware/rbac.js';

export function createAuditLogApp(db: DB): Application {
  const app = express();
  app.use(express.json());

  // GET /audit-log — query the audit log (operator+ only)
  app.get('/audit-log', requireRole('operator'), (req: Request, res: Response) => {
    const { actorId, resourceType, resourceId, from, to, limit, offset } = req.query as {
      actorId?: string;
      resourceType?: string;
      resourceId?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
    };

    const entries = listAuditLog(db, {
      actorId,
      resourceType,
      resourceId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit !== undefined ? parseInt(limit, 10) : undefined,
      offset: offset !== undefined ? parseInt(offset, 10) : undefined,
    });

    res.json(entries);
  });

  return app;
}
