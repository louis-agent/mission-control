import express, { type Application, type Request, type Response } from 'express';
import {
  getWorkflowById,
  getExecutionRunById,
  listAgents,
  validateWorkflow,
  startExecution,
  advanceExecution,
  cancelExecution,
  approveStep,
  rejectStep,
  listTimedOutTasks,
  listTimedOutRuns,
  updateTask,
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
      const { timeoutMs } = req.body ?? {};
      const run = startExecution(db, req.params.id, { timeoutMs });
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

  // POST /execution-runs/:id/steps/:stepId/approve — approve an approval gate
  app.post(
    '/execution-runs/:id/steps/:stepId/approve',
    (req: Request<{ id: string; stepId: string }>, res: Response) => {
      const run = getExecutionRunById(db, req.params.id);
      if (!run) {
        res.status(404).json({ error: 'ExecutionRun not found' });
        return;
      }

      try {
        approveStep(db, req.params.id, req.params.stepId);
        res.json({ approved: true, stepId: req.params.stepId });
      } catch (err) {
        res.status(409).json({ error: (err as Error).message });
      }
    },
  );

  // POST /execution-runs/:id/steps/:stepId/reject — reject an approval gate
  app.post(
    '/execution-runs/:id/steps/:stepId/reject',
    (req: Request<{ id: string; stepId: string }>, res: Response) => {
      const run = getExecutionRunById(db, req.params.id);
      if (!run) {
        res.status(404).json({ error: 'ExecutionRun not found' });
        return;
      }

      try {
        const { reason } = req.body ?? {};
        rejectStep(db, req.params.id, req.params.stepId, reason);
        res.json({ rejected: true, stepId: req.params.stepId });
      } catch (err) {
        res.status(409).json({ error: (err as Error).message });
      }
    },
  );

  // POST /execution-runs/check-timeouts — fail timed-out tasks, cancel timed-out runs
  app.post('/execution-runs/check-timeouts', (_req: Request, res: Response) => {
    const timedOutTasks = listTimedOutTasks(db);
    for (const task of timedOutTasks) {
      updateTask(db, task.id, { status: 'failed', errorMessage: 'Step timed out' });
    }

    const timedOutRuns = listTimedOutRuns(db);
    for (const run of timedOutRuns) {
      try {
        cancelExecution(db, run.id);
      } catch {
        // already in terminal state
      }
    }

    // Advance affected execution runs so step failures are recorded
    const affectedRunIds = new Set<string>();
    for (const task of timedOutTasks) {
      if (task.executionRunId) affectedRunIds.add(task.executionRunId);
    }
    for (const runId of affectedRunIds) {
      advanceExecution(db, runId);
    }

    res.json({
      timedOutTasks: timedOutTasks.length,
      timedOutRuns: timedOutRuns.length,
    });
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
