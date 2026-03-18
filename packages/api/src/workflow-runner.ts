import express, { type Application, type Request, type Response } from 'express';
import {
  getWorkflowById,
  getExecutionRunById,
  listAgents,
  validateWorkflow,
  startExecution,
  advanceExecution,
  cancelExecution,
  InvalidTransitionError,
  type DB,
} from '@mission-control/core';

export function createWorkflowRunnerApp(db: DB): Application {
  const app = express();
  app.use(express.json());

  // POST /workflows/:id/execute — start a new execution run
  app.post('/workflows/:id/execute', (req: Request<{ id: string }>, res: Response) => {
    const workflow = getWorkflowById(db, req.params.id);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    try {
      const run = startExecution(db, req.params.id);
      res.status(201).json(run);
    } catch (err) {
      res.status(422).json({ error: (err as Error).message });
    }
  });

  // GET /execution-runs/:id — get run status with step results
  app.get('/execution-runs/:id', (req: Request<{ id: string }>, res: Response) => {
    const run = getExecutionRunById(db, req.params.id);
    if (!run) {
      res.status(404).json({ error: 'ExecutionRun not found' });
      return;
    }
    res.json(run);
  });

  // POST /execution-runs/:id/advance — advance a running execution (poll/tick)
  app.post('/execution-runs/:id/advance', (req: Request<{ id: string }>, res: Response) => {
    const existing = getExecutionRunById(db, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'ExecutionRun not found' });
      return;
    }

    const run = advanceExecution(db, req.params.id);
    res.json(run);
  });

  // POST /execution-runs/:id/cancel — cancel a running execution
  app.post('/execution-runs/:id/cancel', (req: Request<{ id: string }>, res: Response) => {
    const existing = getExecutionRunById(db, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'ExecutionRun not found' });
      return;
    }

    try {
      const run = cancelExecution(db, req.params.id);
      res.json(run);
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // GET /workflows/:id/validate — dry-run validation
  app.get('/workflows/:id/validate', (req: Request<{ id: string }>, res: Response) => {
    const workflow = getWorkflowById(db, req.params.id);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    const agents = listAgents(db);
    const result = validateWorkflow(workflow, agents);
    res.json(result);
  });

  return app;
}
