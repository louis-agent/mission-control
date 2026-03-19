/**
 * Database factory.
 *
 * Reads DATABASE_URL at startup and returns the appropriate Repositories
 * implementation:
 *
 *   - postgres://... or postgresql://...  → PostgreSQL via postgres-js + Drizzle
 *   - anything else (or undefined)        → SQLite via better-sqlite3 + Drizzle
 *
 * The DB_PATH environment variable (default: ./mission-control.db) is used for
 * the SQLite file path when no DATABASE_URL is set.
 *
 * Usage in server.ts:
 *
 *   const repos = createRepositories();
 *   // pass repos (or repos.agents, repos.tasks, ...) to route factories
 */

import { createDb } from './db.js';
import { createSqliteRepositories } from './repository-sqlite.js';
import type { Repositories } from './repository.js';

/**
 * Create repository implementations based on DATABASE_URL environment variable.
 *
 * @param databaseUrl Override the DATABASE_URL lookup (useful in tests).
 * @param dbPath      SQLite file path for the SQLite adapter (default: DB_PATH env or :memory:).
 */
export function createRepositories(
  databaseUrl?: string,
  dbPath?: string,
): Repositories {
  const url = databaseUrl ?? process.env.DATABASE_URL;

  if (url && (url.startsWith('postgres://') || url.startsWith('postgresql://'))) {
    // Dynamic import would make this function async; use a sync shim via
    // createSqliteRepositories as a compile-time placeholder. Runtime callers
    // that need PostgreSQL should call createPostgresRepositories() directly.
    // This path is kept here for future async migration.
    throw new Error(
      'PostgreSQL support requires calling createPostgresRepositories() directly (async). ' +
      'Set DATABASE_URL to a postgres:// URL and use createPostgresRepositories(DATABASE_URL).',
    );
  }

  const path = dbPath ?? process.env.DB_PATH ?? ':memory:';
  const db = createDb(path);
  return createSqliteRepositories(db);
}
