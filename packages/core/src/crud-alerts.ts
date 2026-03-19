import { eq } from 'drizzle-orm';
import type { DB } from './db.js';
import { alertRules, alertStates } from './schema.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlertMetric = 'task_queue_depth' | 'failure_rate' | 'agent_offline_count';
export type AlertOperator = 'gt' | 'gte' | 'lt' | 'lte';
export type AlertStatus = 'ok' | 'firing';

export interface AlertRule {
  id: string;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  webhookUrl: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertState {
  ruleId: string;
  status: AlertStatus;
  lastValue: number;
  firedAt: Date | null;
  resolvedAt: Date | null;
  updatedAt: Date;
}

export interface CreateAlertRuleInput {
  id: string;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  webhookUrl: string;
  active?: boolean;
}

export interface UpdateAlertRuleInput {
  name?: string;
  metric?: AlertMetric;
  operator?: AlertOperator;
  threshold?: number;
  webhookUrl?: string;
  active?: boolean;
}

type RuleRow = typeof alertRules.$inferSelect;
type StateRow = typeof alertStates.$inferSelect;

function rowToRule(row: RuleRow): AlertRule {
  return {
    id: row.id,
    name: row.name,
    metric: row.metric as AlertMetric,
    operator: row.operator as AlertOperator,
    threshold: row.threshold,
    webhookUrl: row.webhookUrl,
    active: row.active,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

function rowToState(row: StateRow): AlertState {
  return {
    ruleId: row.ruleId,
    status: row.status as AlertStatus,
    lastValue: row.lastValue,
    firedAt: (row.firedAt as Date | null) ?? null,
    resolvedAt: (row.resolvedAt as Date | null) ?? null,
    updatedAt: row.updatedAt as Date,
  };
}

// ── Alert rule CRUD ───────────────────────────────────────────────────────────

export function createAlertRule(db: DB, input: CreateAlertRuleInput): AlertRule {
  const now = new Date();
  db.insert(alertRules).values({
    id: input.id,
    name: input.name,
    metric: input.metric,
    operator: input.operator,
    threshold: input.threshold,
    webhookUrl: input.webhookUrl,
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  }).run();
  return getAlertRuleById(db, input.id)!;
}

export function getAlertRuleById(db: DB, id: string): AlertRule | null {
  const row = db.select().from(alertRules).where(eq(alertRules.id, id)).get();
  return row ? rowToRule(row) : null;
}

export function listAlertRules(db: DB): AlertRule[] {
  return db.select().from(alertRules).all().map(rowToRule);
}

export function updateAlertRule(db: DB, id: string, input: UpdateAlertRuleInput): AlertRule | null {
  const updates: Partial<RuleRow> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.metric !== undefined) updates.metric = input.metric;
  if (input.operator !== undefined) updates.operator = input.operator;
  if (input.threshold !== undefined) updates.threshold = input.threshold;
  if (input.webhookUrl !== undefined) updates.webhookUrl = input.webhookUrl;
  if (input.active !== undefined) updates.active = input.active;
  db.update(alertRules).set(updates).where(eq(alertRules.id, id)).run();
  return getAlertRuleById(db, id);
}

export function deleteAlertRule(db: DB, id: string): boolean {
  db.delete(alertStates).where(eq(alertStates.ruleId, id)).run();
  const result = db.delete(alertRules).where(eq(alertRules.id, id)).run();
  return result.changes > 0;
}

// ── Alert state ───────────────────────────────────────────────────────────────

export function getAlertState(db: DB, ruleId: string): AlertState | null {
  const row = db.select().from(alertStates).where(eq(alertStates.ruleId, ruleId)).get();
  return row ? rowToState(row) : null;
}

export function listAlertStates(db: DB): AlertState[] {
  return db.select().from(alertStates).all().map(rowToState);
}

export function upsertAlertState(
  db: DB,
  ruleId: string,
  status: AlertStatus,
  lastValue: number,
): AlertState {
  const now = new Date();
  const existing = getAlertState(db, ruleId);

  if (!existing) {
    db.insert(alertStates).values({
      ruleId,
      status,
      lastValue,
      firedAt: status === 'firing' ? now : null,
      resolvedAt: null,
      updatedAt: now,
    }).run();
  } else {
    const updates: Partial<StateRow> = { status, lastValue, updatedAt: now };
    if (status === 'firing' && existing.status !== 'firing') updates.firedAt = now;
    if (status === 'ok' && existing.status === 'firing') updates.resolvedAt = now;
    db.update(alertStates).set(updates).where(eq(alertStates.ruleId, ruleId)).run();
  }

  return getAlertState(db, ruleId)!;
}
