import express, { type Application, type Request, type Response } from 'express';
import { PluginRegistry, shellExecutorHandler, httpCallerHandler } from '@mission-control/core';
import type { TaskHandler } from '@mission-control/core';

export function createPluginManagerApp(registry?: PluginRegistry): Application {
  const reg = registry ?? new PluginRegistry();

  // Register built-ins if not already present
  for (const handler of [shellExecutorHandler, httpCallerHandler] as TaskHandler[]) {
    try { reg.register(handler); } catch { /* already registered */ }
  }

  const app = express();
  app.use(express.json());

  app.get('/plugins', (_req: Request, res: Response) => {
    res.json(reg.list().map((name) => ({ name })));
  });

  app.get('/plugins/:name', (req: Request<{ name: string }>, res: Response) => {
    if (!reg.list().includes(req.params.name)) {
      res.status(404).json({ error: 'Plugin not found' });
      return;
    }
    res.json({ name: req.params.name });
  });

  // POST /plugins/:name/execute — run a plugin by name with inline task input
  app.post('/plugins/:name/execute', async (req: Request<{ name: string }>, res: Response) => {
    const name = req.params.name;
    const handler = reg.getByName(name);
    if (!handler) {
      res.status(404).json({ error: 'Plugin not found' });
      return;
    }

    const taskInput = {
      id: 'inline',
      title: req.body?.title ?? `${name}: inline`,
      description: '',
      status: 'running' as const,
      priority: 'medium' as const,
      requiredCapabilities: [],
      assigneeAgentId: null,
      workflowId: null,
      executionRunId: null,
      stepId: null,
      dependencies: [],
      input: req.body?.input ?? {},
      output: {},
      errorMessage: null,
      maxRetries: 0,
      retryCount: 0,
      retryDelay: 1000,
      timeoutAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const output = await handler.execute(taskInput);
      res.json({ output });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return app;
}
