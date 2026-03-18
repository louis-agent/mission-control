import { randomUUID } from 'crypto';
import express, { type Application, type Request, type Response } from 'express';
import {
  createTask,
  getTaskById,
  listTasks,
  updateTask,
  listPendingTasks,
  listTasksByStatus,
  listAgents,
  type DB,
} from '@mission-control/core';

// ──────────────────────────────────────────────────────────────────────────────
// Dispatch logic
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Find the oldest pending task whose requiredCapabilities are all covered by
 * at least one idle agent, then assign it to that agent.
 *
 * Returns the updated task or null if nothing could be dispatched.
 */
function dispatchNextTask(db: DB) {
  const pending = listPendingTasks(db); // FIFO order
  const idleAgents = listAgents(db).filter((a) => a.status === 'idle');

  for (const task of pending) {
    const agent = idleAgents.find((a) =>
      task.requiredCapabilities.every((cap) => a.capabilities.includes(cap))
    );
    if (!agent) continue;

    // Assign: pending → assigned, mark agent busy
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

export function createQueueApp(db: DB): Application {
  const app = express();
  app.use(express.json());

  // POST /tasks — submit a new task
  app.post('/tasks', (req: Request, res: Response) => {
    const {
      id,
      title,
      description,
      requiredCapabilities,
      workflowId,
      dependencies,
      input,
    } = req.body as {
      id?: string;
      title?: string;
      description?: string;
      requiredCapabilities?: string[];
      workflowId?: string;
      dependencies?: string[];
      input?: Record<string, unknown>;
    };

    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const task = createTask(db, {
      id: id ?? randomUUID(),
      title,
      description: description ?? '',
      status: 'pending',
      requiredCapabilities: requiredCapabilities ?? [],
      assigneeAgentId: null,
      workflowId: workflowId ?? null,
      dependencies: dependencies ?? [],
      input: input ?? {},
      output: {},
      errorMessage: null,
    });

    res.status(201).json(task);
  });

  // GET /tasks — list tasks, optional ?status= filter
  app.get('/tasks', (req: Request, res: Response) => {
    const { status } = req.query as { status?: string };

    const validStatuses = ['pending', 'assigned', 'running', 'completed', 'failed'];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ error: `invalid status '${status}'` });
      return;
    }

    const result = status
      ? listTasksByStatus(db, status as Parameters<typeof listTasksByStatus>[1])
      : listTasks(db);

    res.json(result);
  });

  // GET /tasks/:id — get a task by id
  app.get('/tasks/:id', (req: Request<{ id: string }>, res: Response) => {
    const task = getTaskById(db, req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json(task);
  });

  // POST /tasks/dispatch — assign the oldest eligible pending task to an idle agent
  app.post('/tasks/dispatch', (_req: Request, res: Response) => {
    const task = dispatchNextTask(db);
    if (!task) {
      res.status(200).json({ dispatched: false, task: null });
      return;
    }
    res.status(200).json({ dispatched: true, task });
  });

  // POST /tasks/:id/start — transition assigned → running
  app.post('/tasks/:id/start', (req: Request<{ id: string }>, res: Response) => {
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
  });

  // POST /tasks/:id/complete — transition running → completed with output
  app.post('/tasks/:id/complete', (req: Request<{ id: string }>, res: Response) => {
    const existing = getTaskById(db, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    if (existing.status !== 'running') {
      res.status(409).json({ error: `cannot complete a task in status '${existing.status}'` });
      return;
    }
    const { output } = req.body as { output?: Record<string, unknown> };
    const task = updateTask(db, req.params.id, {
      status: 'completed',
      output: output ?? {},
    });
    res.json(task);
  });

  // POST /tasks/:id/fail — transition running → failed with error message
  app.post('/tasks/:id/fail', (req: Request<{ id: string }>, res: Response) => {
    const existing = getTaskById(db, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    if (existing.status !== 'running') {
      res.status(409).json({ error: `cannot fail a task in status '${existing.status}'` });
      return;
    }
    const { error } = req.body as { error?: string };
    const task = updateTask(db, req.params.id, {
      status: 'failed',
      errorMessage: error ?? 'unknown error',
    });
    res.json(task);
  });

  return app;
}
