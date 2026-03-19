import { randomUUID } from 'crypto';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { auditLog } from './schema.js';
import type { DB } from './db.js';
import type { AuditLogEntry, CreateAuditLogInput } from './types.js';

function rowToEntry(row: typeof auditLog.$inferSelect): AuditLogEntry {
  return {
    id: row.id,
    actorId: row.actorId,
    actorType: row.actorType as AuditLogEntry['actorType'],
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    timestamp: row.timestamp,
  };
}

export function createAuditLogEntry(db: DB, input: CreateAuditLogInput): AuditLogEntry {
  const row: typeof auditLog.$inferInsert = {
    id: input.id ?? randomUUID(),
    actorId: input.actorId ?? null,
    actorType: input.actorType,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    metadata: JSON.stringify(input.metadata ?? {}),
    timestamp: input.timestamp,
  };
  db.insert(auditLog).values(row).run();
  return rowToEntry(db.select().from(auditLog).where(eq(auditLog.id, row.id)).get()!);
}

export interface AuditLogFilter {
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export function listAuditLog(db: DB, filter: AuditLogFilter = {}): AuditLogEntry[] {
  const conditions = [];
  if (filter.actorId) conditions.push(eq(auditLog.actorId, filter.actorId));
  if (filter.resourceType) conditions.push(eq(auditLog.resourceType, filter.resourceType));
  if (filter.resourceId) conditions.push(eq(auditLog.resourceId, filter.resourceId));
  if (filter.from) conditions.push(gte(auditLog.timestamp, filter.from));
  if (filter.to) conditions.push(lte(auditLog.timestamp, filter.to));

  let q = db.select().from(auditLog);
  if (conditions.length > 0) {
    // @ts-expect-error drizzle types for chained where with dynamic conditions
    q = q.where(and(...conditions));
  }
  // @ts-expect-error drizzle types for chained orderBy/limit/offset
  q = q.orderBy(sql`${auditLog.timestamp} DESC`);
  if (filter.limit !== undefined) {
    // @ts-expect-error drizzle chaining
    q = q.limit(filter.limit);
  }
  if (filter.offset !== undefined) {
    // @ts-expect-error drizzle chaining
    q = q.offset(filter.offset);
  }

  return q.all().map(rowToEntry);
}
