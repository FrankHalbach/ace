import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { useDb } from './index'

/**
 * Wendet alle ausstehenden Migrations aus `server/db/migrations` an.
 *
 * Wird sowohl beim Server-Start (Nitro-Plugin) als auch von der CLI
 * `pnpm db:migrate` aufgerufen — idempotent durch Drizzle's
 * `__drizzle_migrations`-Tabelle.
 */
export function runMigrations() {
  const db = useDb()
  const migrationsFolder = resolve(process.cwd(), 'server/db/migrations')
  migrate(db, { migrationsFolder })
}

if (import.meta.main || process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
  console.log('✔ Migrations applied')
}
