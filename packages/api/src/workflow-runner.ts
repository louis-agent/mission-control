import express, { type Application, type Request, type Response } from 'express';
import {
  getWorkflowById,
  getExecutionRunById,
  validateWorkflow,
  startExecution,
  advanceExecution,
  cancelExecution,
  approveStep,
  rejectStep,
  listTimedOutTasks,
  listTimedOutRuns,
  listTasksByExecutionRun,
  updateTask,
  InvalidTransitionError,
  type DB,
  type ExecutionRun,
  type StepResult,
  type Task,
} from '@mission-control/core';
import { cachedGetWorkflowById, cachedListAgents } from './cache.js';

export function createWorkflowRunnerApp(db: DB): Application {
  const app = express();
  app.use(express.json());

  // POST /workflows/:id/execute — start a new execution run
  app.post('/workflows/:id/execute', (req: Request<{ id: string }>, res: Response) => {
    const workflow = cachedGetWorkflowById(db, req.params.id);
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

  // GET /execution-runs/:id/timeline — ordered list of events for a run
  app.get('/execution-runs/:id/timeline', (req: Request<{ id: string }>, res: Response) => {
    const run = getExecutionRunById(db, req.params.id);
    if (!run) {
      res.status(404).json({ error: 'ExecutionRun not found' });
      return;
    }

    const tasks = listTasksByExecutionRun(db, req.params.id);
    const events = buildTimeline(run, tasks);
    res.json({ runId: run.id, events });
  });

  // GET /workflows/:id/validate — dry-run validation
  app.get('/workflows/:id/validate', (req: Request<{ id: string }>, res: Response) => {
    const workflow = cachedGetWorkflowById(db, req.params.id);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    const agents = cachedListAgents(db);
    const result = validateWorkflow(workflow, agents);
    res.json(result);
  });

  return app;
}

// ── Timeline builder ──────────────────────────────────────────────────────────

interface TimelineEvent {
  timestamp: string;
  type: string;
  stepId: string | null;
  taskId: string | null;
  detail: string;
  status?: string;
}

function buildTimeline(run: ExecutionRun, tasks: Task[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    timestamp: run.createdAt.toISOString(),
    type: 'run.created',
    stepId: null,
    taskId: null,
    detail: `Execution run created for workflow ${run.workflowId}`,
    status: run.status,
  });

  if (run.startedAt) {
    events.push({
      timestamp: run.startedAt.toISOString(),
      type: 'run.started',
      stepId: null,
      taskId: null,
      detail: 'Execution run started',
    });
  }

  // Task-level events sorted by createdAt
  const sortedTasks = [...tasks].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const task of sortedTasks) {
    events.push({
      timestamp: task.createdAt.toISOString(),
      type: 'task.created',
      stepId: task.stepId,
      taskId: task.id,
      detail: `Task "${task.title}" created`,
      status: task.status,
    });

    if (task.status !== 'pending') {
      events.push({
        timestamp: task.updatedAt.toISOString(),
        type: `task.${task.status}`,
        stepId: task.stepId,
        taskId: task.id,
        detail: task.errorMessage
          ? `Task "${task.title}" ${task.status}: ${task.errorMessage}`
          : `Task "${task.title}" ${task.status}`,
        status: task.status,
      });
    }
  }

  // Step results from the run
  for (const result of (run.stepResults as StepResult[])) {
    const matchingTask = tasks.find((t) => t.stepId === result.stepId);
    const ts = matchingTask?.updatedAt.toISOString() ?? run.updatedAt.toISOString();
    events.push({
      timestamp: ts,
      type: `step.${result.status}`,
      stepId: result.stepId,
      taskId: matchingTask?.id ?? null,
      detail: result.error
        ? `Step ${result.stepId} ${result.status}: ${result.error}`
        : `Step ${result.stepId} ${result.status}`,
      status: result.status,
    });
  }

  if (run.completedAt) {
    events.push({
      timestamp: run.completedAt.toISOString(),
      type: 'run.completed',
      stepId: null,
      taskId: null,
      detail: 'Execution run completed',
      status: 'completed',
    });
  }

  if (run.cancelledAt) {
    events.push({
      timestamp: run.cancelledAt.toISOString(),
      type: 'run.cancelled',
      stepId: null,
      taskId: null,
      detail: 'Execution run cancelled',
      status: 'cancelled',
    });
  }

  // Sort all events chronologically
  return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
