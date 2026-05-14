import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | undefined

/** Test-Helper: setzt die DB-Instanz zurück, damit der nächste useDb()-Aufruf
 *  eine frische Verbindung öffnet. Im Produktivcode nicht benutzen. */
export function _resetDbForTests() {
  dbInstance = undefined
}

/**
 * Lazy-initialized Drizzle-Client gegen SQLite.
 *
 * Setzt beim ersten Aufruf die wichtigen Pragmas
 * (siehe CLAUDE.md § Datenbank und Migrations):
 *   - journal_mode = WAL  → mehr Concurrent-Read-Performance
 *   - foreign_keys = ON   → FK-Constraints werden enforced
 *   - busy_timeout = 5000 → 5 Sekunden warten bei Locks statt sofort fail
 */
export function useDb() {
  if (dbInstance) return dbInstance

  const dbPath = resolve(process.env.NUXT_DB_PATH ?? './data/ace.db')
  mkdirSync(dirname(dbPath), { recursive: true })

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')

  dbInstance = drizzle(sqlite, { schema })
  return dbInstance
}

export { schema }
