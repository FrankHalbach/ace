import { eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import { ageGroup } from '../../../db/schema/age-group'
import { matchPointsAward } from '../../../db/schema/match-points-award'
import { member } from '../../../db/schema/member'
import { ranking, type RankingId } from '../../../db/schema/ranking'
import { rankingEntry } from '../../../db/schema/ranking-entry'
import { season } from '../../../db/schema/season'
import type { EntryWithLk, RankingMutation } from '../strategy/types'
import type { MatchResultId } from '../../../db/schema/match-result'

/**
 * Liefert alle Einträge einer Rangliste — Snapshot für Strategy-Calls.
 * LK wird mit-geladen, damit die `points-table`-Strategy LK als Tiebreaker
 * verwenden kann (N-01).
 */
export function getRankingEntries(rankingId: RankingId): EntryWithLk[] {
  const rows = useDb()
    .select({ entry: rankingEntry, memberLk: member.dtbLk })
    .from(rankingEntry)
    .innerJoin(member, eq(rankingEntry.memberId, member.id))
    .where(eq(rankingEntry.rankingId, rankingId))
    .orderBy(rankingEntry.position)
    .all()
  return rows.map((r) => ({ ...r.entry, memberLk: r.memberLk }))
}

/**
 * Wendet die von einer Strategy gelieferten Mutationen atomar auf die Rangliste an.
 *
 * `matchResultId` wird für `award-points`-Mutationen gebraucht, damit die Audit-
 * Tabelle `match_points_award` den Bezug zum Match-Ergebnis hat.
 *
 * Wenn `matchResultId` nicht übergeben wird (z. B. bei manuellen Korrekturen
 * später), werden `award-points`-Mutationen übersprungen.
 */
export function applyMutations(mutations: RankingMutation[], matchResultId?: MatchResultId): void {
  const db = useDb()
  // SQLite + better-sqlite3 unterstützt Transaktionen synchron
  db.transaction((tx) => {
    for (const m of mutations) {
      switch (m.kind) {
        case 'set-position':
          tx.update(rankingEntry)
            .set({ position: m.position })
            .where(eq(rankingEntry.id, m.entryId))
            .run()
          break
        case 'set-points':
          tx.update(rankingEntry)
            .set({ points: m.points })
            .where(eq(rankingEntry.id, m.entryId))
            .run()
          break
        case 'set-elo':
          tx.update(rankingEntry)
            .set({ eloRating: m.eloRating })
            .where(eq(rankingEntry.id, m.entryId))
            .run()
          break
        case 'set-last-match':
          tx.update(rankingEntry)
            .set({ lastMatchAt: m.at })
            .where(eq(rankingEntry.id, m.entryId))
            .run()
          break
        case 'award-points':
          if (matchResultId) {
            tx.insert(matchPointsAward)
              .values({
                matchResultId,
                rankingEntryId: m.rankingEntryId,
                memberId: m.memberId,
                points: m.points,
                reason: m.reason,
              })
              .run()
          }
          break
      }
    }
  })
}

/**
 * Lookup für den Modus + Config einer Rangliste — wird von challenges/results
 * für Strategy-Calls gebraucht. `seasonStatus` hängt mit, damit Aufrufer
 * (z. B. Forderungs-Create) prüfen können, ob die Saison noch aktiv ist.
 */
export function getRankingMeta(rankingId: RankingId) {
  return useDb()
    .select({
      id: ranking.id,
      mode: ranking.mode,
      config: ranking.config,
      seasonStatus: season.status,
      seasonConfig: season.config,
    })
    .from(ranking)
    .innerJoin(ageGroup, eq(ranking.ageGroupId, ageGroup.id))
    .innerJoin(season, eq(ageGroup.seasonId, season.id))
    .where(eq(ranking.id, rankingId))
    .get()
}
