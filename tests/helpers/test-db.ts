import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _resetDbForTests, useDb } from '../../server/db'
import { runMigrations } from '../../server/db/migrate'
import { ageGroup } from '../../server/db/schema/age-group'
import { magicLinkToken } from '../../server/db/schema/magic-link-token'
import { member } from '../../server/db/schema/member'
import { ranking } from '../../server/db/schema/ranking'
import { rankingEntry } from '../../server/db/schema/ranking-entry'
import { rateLimitEvent } from '../../server/db/schema/rate-limit-event'
import { season } from '../../server/db/schema/season'

/**
 * Erzeugt eine temporäre SQLite-Datei, wendet Migrations an und liefert
 * Helfer für Reset (zwischen Tests) und Cleanup (am Ende der Suite).
 *
 * Reset löscht *alle Zeilen* statt die Datei — vermeidet Windows-File-Locks.
 */
export function createTestDb() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'ace-test-'))
  const dbPath = join(tmpDir, 'test.db')

  function open() {
    process.env.NUXT_DB_PATH = dbPath
    _resetDbForTests()
    runMigrations()
    return useDb()
  }

  return {
    open,
    reset: () => {
      const db = useDb()
      // Reihenfolge wegen FK-Cascade egal, aber explizit pro Tabelle.
      db.delete(rankingEntry).run()
      db.delete(ranking).run()
      db.delete(magicLinkToken).run()
      db.delete(rateLimitEvent).run()
      db.delete(ageGroup).run()
      db.delete(season).run()
      db.delete(member).run()
    },
    cleanup: () => {
      _resetDbForTests()
      // Auf Windows kann die Datei locked sein, wenn die SQLite-Verbindung
      // nicht ordentlich geschlossen wurde. `force: true` ignoriert Fehler.
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // Ignoriere — Temp-Verzeichnis räumt das OS irgendwann
      }
    },
  }
}
