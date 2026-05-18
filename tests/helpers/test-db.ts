import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _resetDbForTests, useDb } from '../../server/db'
import { runMigrations } from '../../server/db/migrate'
import { ageGroup } from '../../server/db/schema/age-group'
import { auditEntry } from '../../server/db/schema/audit-entry'
import { challenge } from '../../server/db/schema/challenge'
import { friendly } from '../../server/db/schema/friendly'
import { friendlyInvitee } from '../../server/db/schema/friendly-invitee'
import { friendlyResult } from '../../server/db/schema/friendly-result'
import { magicLinkToken } from '../../server/db/schema/magic-link-token'
import { matchPointsAward } from '../../server/db/schema/match-points-award'
import { matchResult } from '../../server/db/schema/match-result'
import { member } from '../../server/db/schema/member'
import { memberTeamTag } from '../../server/db/schema/member-team-tag'
import { ranking } from '../../server/db/schema/ranking'
import { rankingEntry } from '../../server/db/schema/ranking-entry'
import { rateLimitEvent } from '../../server/db/schema/rate-limit-event'
import { season } from '../../server/db/schema/season'
import { teamTag } from '../../server/db/schema/team-tag'

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
      db.delete(matchPointsAward).run()
      db.delete(matchResult).run()
      db.delete(challenge).run()
      db.delete(friendlyResult).run()
      db.delete(friendlyInvitee).run()
      db.delete(friendly).run()
      db.delete(rankingEntry).run()
      db.delete(ranking).run()
      db.delete(magicLinkToken).run()
      db.delete(rateLimitEvent).run()
      db.delete(memberTeamTag).run()
      db.delete(teamTag).run()
      db.delete(auditEntry).run()
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
