/**
 * Background jobs HTTP API.
 *
 * POST /jobs           — enqueue a job manually (admin/operator only)
 * GET  /jobs           — list all jobs (admin)
 * GET  /jobs/:id       — get job by id
 */

import express, { type Application, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  createJob,
  getJobById,
  listJobs,
  type DB,
} from '@mission-control/core';

const EnqueueJobSchema = z.object({
  type: z.enum(['workflow_execution', 'webhook_delivery', 'metric_aggregation']),
  payload: z.record(z.string(), z.unknown()).default({}),
  maxAttempts: z.number().int().min(1).max(10).optional(),
});

export function createJobsApp(db: DB): Application {
  const app = express();
  app.use(express.json());

  // POST /jobs — enqueue a job
  app.post('/jobs', (req: Request, res: Response) => {
    const parsed = EnqueueJobSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    const job = createJob(db, parsed.data);
    res.status(202).json(job);
  });

  // GET /jobs — list all jobs
  app.get('/jobs', (_req: Request, res: Response) => {
    res.json(listJobs(db));
  });

  // GET /jobs/:id — get job by id
  app.get('/jobs/:id', (req: Request<{ id: string }>, res: Response) => {
    const job = getJobById(db, req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.json(job);
  });

  return app;
}
