import { createHash, randomBytes } from 'crypto';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { apiKeys } from './schema.js';
import type { DB } from './db.js';
import type { ApiKey, CreateApiKeyInput } from './types.js';

function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

function rowToApiKey(row: typeof apiKeys.$inferSelect): ApiKey {
  return {
    id: row.id,
    name: row.name,
    hashedKey: row.hashedKey,
    agentId: row.agentId,
    role: row.role as ApiKey['role'],
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
}

/** Generate a random API key string and return { plaintext, hashed }. */
export function generateApiKey(): { plaintext: string; hashed: string } {
  const plaintext = `mc_${randomBytes(32).toString('hex')}`;
  return { plaintext, hashed: hashKey(plaintext) };
}

/** Create a new API key record. Caller must supply the hashedKey. */
export function createApiKey(db: DB, input: CreateApiKeyInput): ApiKey {
  const now = input.createdAt ?? new Date();
  const row: typeof apiKeys.$inferInsert = {
    id: input.id,
    name: input.name,
    hashedKey: input.hashedKey,
    agentId: input.agentId ?? null,
    role: input.role,
    createdAt: now,
    expiresAt: input.expiresAt ?? null,
    revokedAt: input.revokedAt ?? null,
  };
  db.insert(apiKeys).values(row).run();
  return rowToApiKey(db.select().from(apiKeys).where(eq(apiKeys.id, row.id)).get()!);
}

/** Look up a key record by plaintext bearer token. Returns null if invalid/revoked/expired. */
export function getApiKeyByPlaintext(db: DB, plaintext: string): ApiKey | null {
  const hashed = hashKey(plaintext);
  const row = db.select().from(apiKeys).where(eq(apiKeys.hashedKey, hashed)).get();
  if (!row) return null;
  const key = rowToApiKey(row);
  if (key.revokedAt) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  return key;
}

export function getApiKeyById(db: DB, id: string): ApiKey | null {
  const row = db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  return row ? rowToApiKey(row) : null;
}

export function listApiKeys(db: DB): ApiKey[] {
  return db.select().from(apiKeys).all().map(rowToApiKey);
}

/** Revoke a key by setting revokedAt. Returns null if not found. */
export function revokeApiKey(db: DB, id: string): ApiKey | null {
  const existing = getApiKeyById(db, id);
  if (!existing) return null;
  db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id)).run();
  return getApiKeyById(db, id);
}
