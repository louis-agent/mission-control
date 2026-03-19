import { randomUUID } from 'crypto';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  createTask,
  getTaskById,
  listTasks,
  updateTask,
  listPendingTasks,
  listTasksByStatus,
  listDeadLetterTasks,
  requeueTaskForRetry,
  listAgents,
  type DB,
  type Task,
} from '@mission-control/core';
import { CreateTaskSchema, CompleteTaskSchema, FailTaskSchema } from './validation.js';

// Reply inline with Zod validation errors (400) — avoids needing error middleware in sub-app
function replyZodError(res: Response, err: ZodError): void {
  res.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: err.issues },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Quota config
// ──────────────────────────────────────────────────────────────────────────────

export interface QueueQuotas {
  /** Max concurrent tasks (assigned + running) per agent. Default: unlimited. */
  maxTasksPerAgent?: number;
  /** Max total concurrent tasks (assigned + running) across all agents. Default: unlimited. */
  globalConcurrencyLimit?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Dispatch logic
// ──────────────────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES: Task['status'][] = ['assigned', 'running'];

/**
 * Find the highest-priority pending task whose requiredCapabilities are all
 * covered by at least one idle agent, respecting resource quotas.
 *
 * Returns the updated task or null if nothing could be dispatched.
 */
function dispatchNextTask(db: DB, quotas: QueueQuotas = {}) {
  const pending = listPendingTasks(db); // sorted by priority then FIFO
  const allTasks = listTasks(db);
  const idleAgents = listAgents(db).filter((a) => a.status === 'idle');

  // Count active tasks per agent
  const activePerAgent = new Map<string, number>();
  for (const t of allTasks) {
    if (t.assigneeAgentId && ACTIVE_STATUSES.includes(t.status)) {
      activePerAgent.set(t.assigneeAgentId, (activePerAgent.get(t.assigneeAgentId) ?? 0) + 1);
    }
  }

  // Count global active tasks
  const globalActive = allTasks.filter((t) => ACTIVE_STATUSES.includes(t.status)).length;
  if (quotas.globalConcurrencyLimit !== undefined && globalActive >= quotas.globalConcurrencyLimit) {
    return null;
  }

  for (const task of pending) {
    const agent = idleAgents.find((a) => {
      if (!task.requiredCapabilities.every((cap) => a.capabilities.includes(cap))) return false;
      if (quotas.maxTasksPerAgent !== undefined) {
        const agentActive = activePerAgent.get(a.id) ?? 0;
        if (agentActive >= quotas.maxTasksPerAgent) return false;
      }
      return true;
    });
    if (!agent) continue;

    const assigned = updateTask(db, task.id, {
      status: 'assigned',
      assigneeAgentId: agent.id,
    });

    // Mark the agent as busy so it won't be double-dispatched in the same call
    idleAgents.splice(idleAgents.indexOf(agent), 1);

    return assigned;
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Express app
// ──────────────────────────────────────────────────────────────────────────────

const VALID_STATUSES = ['pending', 'assigned', 'running', 'completed', 'failed', 'dead_letter'] as const;

export function createQueueApp(db: DB, quotas: QueueQuotas = {}): Application {
  const app = express();
  app.use(express.json());

  // POST /tasks — submit a new task
  app.post('/tasks', (req: Request, res: Response) => {
    const parsed = CreateTaskSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      replyZodError(res, parsed.error);
      return;
    }

    const {
      id,
      title,
      description,
      priority,
      requiredCapabilities,
      workflowId,
      dependencies,
      input,
      maxRetries,
      retryDelay,
    } = parsed.data;

    const task = createTask(db, {
      id: id ?? randomUUID(),
      title,
      description: description ?? '',
      status: 'pending',
      priority: priority ?? 'medium',
      requiredCapabilities: requiredCapabilities ?? [],
      assigneeAgentId: null,
      workflowId: workflowId ?? null,
      dependencies: dependencies ?? [],
      input: input ?? {},
      output: {},
      errorMessage: null,
      maxRetries: maxRetries ?? 0,
      retryDelay: retryDelay ?? 1000,
    });

    res.status(201).json(task);
  });

  // GET /tasks — list tasks, optional ?status= filter
  app.get('/tasks', (req: Request, res: Response, next: NextFunction) => {
    const { status } = req.query as { status?: string };

    if (status && !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      res.status(400).json({ error: `invalid status '${status}'` });
      return;
    }

    try {
      const result = status
        ? listTasksByStatus(db, status as Parameters<typeof listTasksByStatus>[1])
        : listTasks(db);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /tasks/dead-letter — list dead-lettered tasks (must be before /tasks/:id)
  app.get('/tasks/dead-letter', (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(listDeadLetterTasks(db));
    } catch (err) {
      next(err);
    }
  });

  // GET /tasks/:id — get a task by id
  app.get('/tasks/:id', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const task = getTaskById(db, req.params.id);
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      res.json(task);
    } catch (err) {
      next(err);
    }
  });

  // POST /tasks/dispatch — assign the highest-priority eligible pending task to an idle agent
  app.post('/tasks/dispatch', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const task = dispatchNextTask(db, quotas);
      if (!task) {
        res.status(200).json({ dispatched: false, task: null });
        return;
      }
      res.status(200).json({ dispatched: true, task });
    } catch (err) {
      next(err);
    }
  });

  // POST /tasks/:id/start — transition assigned → running
  app.post('/tasks/:id/start', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const existing = getTaskById(db, req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      if (existing.status !== 'assigned') {
        res.status(409).json({ error: `cannot start a task in status '${existing.status}'` });
        return;
      }
      const task = updateTask(db, req.params.id, { status: 'running' });
      res.json(task);
    } catch (err) {
      next(err);
    }
  });

  // POST /tasks/:id/complete — transition running → completed with output
  app.post('/tasks/:id/complete', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = CompleteTaskSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      replyZodError(res, parsed.error);
      return;
    }

    try {
      const existing = getTaskById(db, req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      if (existing.status !== 'running') {
        res.status(409).json({ error: `cannot complete a task in status '${existing.status}'` });
        return;
      }
      const task = updateTask(db, req.params.id, {
        status: 'completed',
        output: parsed.data.output ?? {},
      });
      res.json(task);
    } catch (err) {
      next(err);
    }
  });

  // POST /tasks/:id/fail — transition running → failed (or requeue for retry)
  app.post('/tasks/:id/fail', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = FailTaskSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      replyZodError(res, parsed.error);
      return;
    }

    try {
      const existing = getTaskById(db, req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      if (existing.status !== 'running') {
        res.status(409).json({ error: `cannot fail a task in status '${existing.status}'` });
        return;
      }

      const errorMessage = parsed.data.error ?? 'unknown error';

      // Use retry logic if maxRetries > 0
      const task = existing.maxRetries > 0
        ? requeueTaskForRetry(db, req.params.id, errorMessage)
        : updateTask(db, req.params.id, { status: 'failed', errorMessage });

      res.json(task);
    } catch (err) {
      next(err);
    }
  });

  // POST /tasks/:id/retry — manually retry a dead-lettered task
  app.post('/tasks/:id/retry', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const existing = getTaskById(db, req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      if (existing.status !== 'dead_letter') {
        res.status(409).json({ error: `can only manually retry dead-lettered tasks, got '${existing.status}'` });
        return;
      }
      const task = updateTask(db, req.params.id, {
        status: 'pending',
        assigneeAgentId: null,
        errorMessage: null,
        retryCount: 0,
      });
      res.json(task);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /tasks/:id/dead-letter — discard a dead-lettered task (cancel it)
  app.delete('/tasks/:id/dead-letter', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const existing = getTaskById(db, req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      if (existing.status !== 'dead_letter') {
        res.status(409).json({ error: `can only discard dead-lettered tasks, got '${existing.status}'` });
        return;
      }
      const task = updateTask(db, req.params.id, { status: 'cancelled' });
      res.json(task);
    } catch (err) {
      next(err);
    }
  });

  return app;
}
