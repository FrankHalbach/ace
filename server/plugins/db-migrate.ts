import { runMigrations } from '../db/migrate'

/**
 * Wendet beim Server-Start ausstehende Drizzle-Migrations an.
 *
 * Idempotent dank Drizzle's __drizzle_migrations-Tabelle. Im Fehlerfall
 * wirft der Server beim Start — bewusst harte Failure-Mode, damit
 * Schema-Inkonsistenzen sofort sichtbar werden.
 */
export default defineNitroPlugin(() => {
  runMigrations()
})
