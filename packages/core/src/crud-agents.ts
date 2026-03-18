import { eq, like } from 'drizzle-orm';
import type { DB } from './db.js';
import { agents } from './schema.js';
import type { Agent, CreateAgentInput, UpdateAgentInput } from './types.js';
import { toJson, fromJson } from './json-utils.js';

type AgentRow = typeof agents.$inferSelect;

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    capabilities: fromJson<string[]>(row.capabilities),
    status: row.status,
    metadata: fromJson<Record<string, unknown>>(row.metadata),
    lastHeartbeatAt: (row.lastHeartbeatAt as Date | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export function createAgent(db: DB, input: CreateAgentInput): Agent {
  const now = new Date();
  db.insert(agents).values({
    id: input.id,
    name: input.name,
    capabilities: toJson(input.capabilities),
    status: input.status,
    metadata: toJson(input.metadata),
    lastHeartbeatAt: null,
    createdAt: now,
    updatedAt: now,
  }).run();
  return getAgentById(db, input.id)!;
}

export function getAgentById(db: DB, id: string): Agent | null {
  const row = db.select().from(agents).where(eq(agents.id, id)).get();
  return row ? rowToAgent(row) : null;
}

export function listAgents(db: DB): Agent[] {
  return db.select().from(agents).all().map(rowToAgent);
}

export function updateAgent(db: DB, id: string, input: UpdateAgentInput): Agent | null {
  const updates: Partial<AgentRow> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.capabilities !== undefined) updates.capabilities = toJson(input.capabilities);
  if (input.status !== undefined) updates.status = input.status;
  if (input.metadata !== undefined) updates.metadata = toJson(input.metadata);
  db.update(agents).set(updates).where(eq(agents.id, id)).run();
  return getAgentById(db, id);
}

export function deleteAgent(db: DB, id: string): boolean {
  const result = db.delete(agents).where(eq(agents.id, id)).run();
  return result.changes > 0;
}

export function listAgentsByCapability(db: DB, capability: string): Agent[] {
  // capabilities is stored as a JSON array; use LIKE to match the capability string
  return db.select().from(agents)
    .where(like(agents.capabilities, `%"${capability}"%`))
    .all()
    .map(rowToAgent);
}

export function heartbeatAgent(db: DB, id: string): Agent | null {
  const now = new Date();
  db.update(agents)
    .set({ lastHeartbeatAt: now, updatedAt: now })
    .where(eq(agents.id, id))
    .run();
  return getAgentById(db, id);
}
