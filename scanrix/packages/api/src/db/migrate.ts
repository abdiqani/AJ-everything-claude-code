/**
 * Database migration runner.
 * Reads all SQL files from infra/db/migrations (sorted) and applies any not yet recorded.
 *
 * Usage:  npm run migrate   (ts-node -r ts-node/register src/db/migrate.ts)
 */
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/db/migrations');

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Ensure migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: applied } = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  );
  const appliedSet = new Set(applied.map((r) => r.version));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`Applying migration: ${file}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      ran++;
      console.log(`  ✓ Applied: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ✗ Failed: ${file}`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  if (ran === 0) {
    console.log('No new migrations to apply.');
  } else {
    console.log(`\nApplied ${ran} migration(s).`);
  }

  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
