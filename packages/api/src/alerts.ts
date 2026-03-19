import { randomUUID } from 'crypto';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import { z, ZodError } from 'zod';
import {
  createAlertRule,
  getAlertRuleById,
  listAlertRules,
  updateAlertRule,
  deleteAlertRule,
  getAlertState,
  listAlertStates,
  upsertAlertState,
  listAgents,
  listTasks,
  type DB,
  type AlertMetric,
  type AlertOperator,
  type AlertStatus,
} from '@mission-control/core';
import { logger } from './logger.js';

// ── Validation schemas ─────────────────────────────────────────────────────────

const METRICS: AlertMetric[] = ['task_queue_depth', 'failure_rate', 'agent_offline_count'];
const OPERATORS: AlertOperator[] = ['gt', 'gte', 'lt', 'lte'];

const CreateAlertRuleSchema = z.object({
  name: z.string().min(1),
  metric: z.enum(METRICS as [AlertMetric, ...AlertMetric[]]),
  operator: z.enum(OPERATORS as [AlertOperator, ...AlertOperator[]]),
  threshold: z.number(),
  webhookUrl: z.string().url(),
  active: z.boolean().optional(),
});

const UpdateAlertRuleSchema = z.object({
  name: z.string().min(1).optional(),
  metric: z.enum(METRICS as [AlertMetric, ...AlertMetric[]]).optional(),
  operator: z.enum(OPERATORS as [AlertOperator, ...AlertOperator[]]).optional(),
  threshold: z.number().optional(),
  webhookUrl: z.string().url().optional(),
  active: z.boolean().optional(),
});

function replyZodError(res: Response, err: ZodError): void {
  res.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: err.issues },
  });
}

// ── Metric evaluation ─────────────────────────────────────────────────────────

function evaluateMetric(db: DB, metric: AlertMetric): number {
  const agents = listAgents(db);
  const tasks = listTasks(db);
  const oneDayAgo = Date.now() - 86_400_000;

  switch (metric) {
    case 'task_queue_depth':
      return tasks.filter((t) => t.status === 'pending').length;

    case 'failure_rate': {
      const terminal = tasks.filter(
        (t) =>
          ['completed', 'failed', 'cancelled', 'dead_letter'].includes(t.status) &&
          t.updatedAt.getTime() >= oneDayAgo,
      ).length;
      const failed = tasks.filter(
        (t) =>
          ['failed', 'dead_letter'].includes(t.status) &&
          t.updatedAt.getTime() >= oneDayAgo,
      ).length;
      return terminal > 0 ? Math.round((failed / terminal) * 100) : 0;
    }

    case 'agent_offline_count':
      return agents.filter((a) => a.status === 'offline').length;

    default:
      return 0;
  }
}

function checkThreshold(value: number, operator: AlertOperator, threshold: number): boolean {
  switch (operator) {
    case 'gt': return value > threshold;
    case 'gte': return value >= threshold;
    case 'lt': return value < threshold;
    case 'lte': return value <= threshold;
  }
}

// ── Webhook delivery ──────────────────────────────────────────────────────────

async function fireAlertWebhook(
  url: string,
  ruleId: string,
  ruleName: string,
  metric: string,
  value: number,
  status: AlertStatus,
): Promise<void> {
  const body = JSON.stringify({ ruleId, ruleName, metric, value, status, timestamp: new Date().toISOString() });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) {
      logger.warn({ ruleId, url, status: res.status }, 'alert webhook returned non-2xx');
    }
  } catch (err) {
    logger.error({ ruleId, url, err }, 'alert webhook delivery failed');
  }
}

// ── Evaluate + fire all active rules ──────────────────────────────────────────

export async function evaluateAlerts(db: DB): Promise<void> {
  const rules = listAlertRules(db).filter((r) => r.active);

  for (const rule of rules) {
    const value = evaluateMetric(db, rule.metric);
    const shouldFire = checkThreshold(value, rule.operator, rule.threshold);
    const newStatus: AlertStatus = shouldFire ? 'firing' : 'ok';

    const prevState = getAlertState(db, rule.id);
    const prevStatus = prevState?.status ?? 'ok';

    upsertAlertState(db, rule.id, newStatus, value);

    // Fire webhook on state transition
    if (newStatus !== prevStatus) {
      await fireAlertWebhook(rule.webhookUrl, rule.id, rule.name, rule.metric, value, newStatus);
      logger.info({ ruleId: rule.id, metric: rule.metric, value, newStatus }, 'alert state changed');
    }
  }
}

// ── Express app ───────────────────────────────────────────────────────────────

export function createAlertsApp(db: DB): Application {
  const app = express();
  app.use(express.json());

  // POST /alerts/evaluate — trigger alert evaluation
  app.post('/alerts/evaluate', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await evaluateAlerts(db);
      const states = listAlertStates(db);
      res.json({ evaluated: states.length, states });
    } catch (err) {
      next(err);
    }
  });

  // GET /alerts/rules
  app.get('/alerts/rules', (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(listAlertRules(db));
    } catch (err) {
      next(err);
    }
  });

  // POST /alerts/rules
  app.post('/alerts/rules', (req: Request, res: Response, next: NextFunction) => {
    const parsed = CreateAlertRuleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      replyZodError(res, parsed.error);
      return;
    }
    try {
      const rule = createAlertRule(db, {
        id: randomUUID(),
        ...parsed.data,
      });
      res.status(201).json(rule);
    } catch (err) {
      next(err);
    }
  });

  // GET /alerts/rules/:id
  app.get('/alerts/rules/:id', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const rule = getAlertRuleById(db, req.params.id);
      if (!rule) {
        res.status(404).json({ error: 'Alert rule not found' });
        return;
      }
      const state = getAlertState(db, rule.id);
      res.json({ ...rule, state: state ?? null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /alerts/rules/:id
  app.patch('/alerts/rules/:id', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    const parsed = UpdateAlertRuleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      replyZodError(res, parsed.error);
      return;
    }
    try {
      const rule = updateAlertRule(db, req.params.id, parsed.data);
      if (!rule) {
        res.status(404).json({ error: 'Alert rule not found' });
        return;
      }
      res.json(rule);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /alerts/rules/:id
  app.delete('/alerts/rules/:id', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const deleted = deleteAlertRule(db, req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Alert rule not found' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // GET /alerts/states — current firing state of all rules
  app.get('/alerts/states', (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(listAlertStates(db));
    } catch (err) {
      next(err);
    }
  });

  return app;
}
