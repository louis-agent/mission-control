// CLI entry point for running versioned SQL migrations.
// Usage: node dist/migrate.js [db-path]
// Or via package script: pnpm migrate [db-path]
import Database from 'better-sqlite3';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

// __dirname points to dist/ at runtime; migrations/ is a sibling of dist/
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

export async function applyMigrations(dbPath: string): Promise<void> {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Track which migrations have been applied
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(
    (sqlite.prepare('SELECT filename FROM _migrations').all() as { filename: string }[]).map(
      (r) => r.filename,
    ),
  );

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    sqlite.exec(sql);
    sqlite
      .prepare('INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)')
      .run(file, Date.now());
    console.log(`Applied: ${file}`);
    count++;
  }

  sqlite.close();
  if (count === 0) {
    console.log('No new migrations to apply.');
  } else {
    console.log(`Migrations complete. Applied ${count} migration(s).`);
  }
}

// Run when executed directly (not imported)
// In CJS: require.main === module
if (require.main === module) {
  const dbPath = process.argv[2] ?? process.env.DB_PATH ?? './mission-control.db';
  applyMigrations(dbPath).catch((err: Error) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
}
