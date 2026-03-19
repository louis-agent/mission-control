import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type DB = ReturnType<typeof createDb>;

export function createDb(dbPath: string = ':memory:') {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite);
  return drizzle(sqlite, { schema });
}

export function runMigrations(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      capabilities TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'offline')),
      metadata TEXT NOT NULL DEFAULT '{}',
      last_heartbeat_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      steps TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'medium',
      required_capabilities TEXT NOT NULL DEFAULT '[]',
      assignee_agent_id TEXT,
      workflow_id TEXT,
      execution_run_id TEXT,
      step_id TEXT,
      dependencies TEXT NOT NULL DEFAULT '[]',
      input TEXT NOT NULL DEFAULT '{}',
      output TEXT NOT NULL DEFAULT '{}',
      error_message TEXT,
      max_retries INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      retry_delay INTEGER NOT NULL DEFAULT 1000,
      timeout_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS execution_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      parent_run_id TEXT,
      parent_step_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at INTEGER,
      completed_at INTEGER,
      cancelled_at INTEGER,
      timeout_at INTEGER,
      step_results TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Additive migrations for existing databases
  const addIfMissing = (sql: string) => {
    try { sqlite.exec(sql); } catch { /* column already exists */ }
  };
  addIfMissing('ALTER TABLE tasks ADD COLUMN execution_run_id TEXT');
  addIfMissing('ALTER TABLE tasks ADD COLUMN step_id TEXT');
  addIfMissing('ALTER TABLE execution_runs ADD COLUMN cancelled_at INTEGER');
  addIfMissing('ALTER TABLE tasks ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 0');
  addIfMissing('ALTER TABLE tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0');
  addIfMissing('ALTER TABLE tasks ADD COLUMN retry_delay INTEGER NOT NULL DEFAULT 1000');
  // Phase 6: priority, timeouts, approval
  addIfMissing("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'");
  addIfMissing('ALTER TABLE tasks ADD COLUMN timeout_at INTEGER');
  addIfMissing('ALTER TABLE execution_runs ADD COLUMN parent_run_id TEXT');
  addIfMissing('ALTER TABLE execution_runs ADD COLUMN parent_step_id TEXT');
  addIfMissing('ALTER TABLE execution_runs ADD COLUMN timeout_at INTEGER');

  // Security tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      hashed_key TEXT NOT NULL UNIQUE,
      agent_id TEXT,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'operator', 'agent', 'viewer')),
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      revoked_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      timestamp INTEGER NOT NULL
    );
  `);

  // Developer experience tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      secret TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Phase 7: Observability — alert rules and state
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS alert_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      metric TEXT NOT NULL,
      operator TEXT NOT NULL CHECK (operator IN ('gt', 'gte', 'lt', 'lte')),
      threshold INTEGER NOT NULL,
      webhook_url TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_states (
      rule_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'firing')),
      last_value INTEGER NOT NULL DEFAULT 0,
      fired_at INTEGER,
      resolved_at INTEGER,
      updated_at INTEGER NOT NULL
    );
  `);
}
