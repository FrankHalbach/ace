import { and, eq, inArray, sql } from 'drizzle-orm'
import { useDb } from '../../../db'
import { ageGroup } from '../../../db/schema/age-group'
import { challenge } from '../../../db/schema/challenge'
import { matchResult } from '../../../db/schema/match-result'
import { ranking } from '../../../db/schema/ranking'
import { rankingEntry } from '../../../db/schema/ranking-entry'
import { season } from '../../../db/schema/season'
import { rankingEntryRepo } from '../repository/ranking-entry-repo'
import { rankingRepo } from '../repository/ranking-repo'
import { strategyFor } from '../strategy'
import {
  RankingNotFoundError,
  type AgeGroupId,
  type MemberId,
  type MemberMatchStats,
  type MemberRankingStandingDto,
  type RankingDetailDto,
  type RankingEntryDto,
  type RankingId,
  type RankingSummaryDto,
  type SeasonId,
} from '../types'

export type RankingFilter = {
  seasonId?: SeasonId
  ageGroupId?: AgeGroupId
}

export const rankingReadService = {
  /**
   * Liste aller Ranglisten mit Filter — angereichert mit Season-/AgeGroup-Name
   * und Entry-Count. Cross-Modul-DB-Joins sind hier erlaubt (ADR-005).
   */
  list(filter: RankingFilter = {}): RankingSummaryDto[] {
    const wheres = []
    if (filter.seasonId) wheres.push(eq(ranking.seasonId, filter.seasonId))
    if (filter.ageGroupId) wheres.push(eq(ranking.ageGroupId, filter.ageGroupId))

    const rows = useDb()
      .select({
        ranking,
        ageGroupName: ageGroup.name,
        seasonName: season.name,
        entryCount: sql<number>`(SELECT COUNT(*) FROM ${rankingEntry} WHERE ${rankingEntry.rankingId} = ${ranking.id})`,
      })
      .from(ranking)
      .innerJoin(ageGroup, eq(ranking.ageGroupId, ageGroup.id))
      .innerJoin(season, eq(ranking.seasonId, season.id))
      .where(wheres.length ? and(...wheres) : undefined)
      .orderBy(season.createdAt, ageGroup.name)
      .all()

    return rows.map((r) => ({
      id: r.ranking.id,
      seasonId: r.ranking.seasonId,
      ageGroupId: r.ranking.ageGroupId,
      mode: r.ranking.mode,
      config: r.ranking.config,
      createdAt: r.ranking.createdAt,
      ageGroupName: r.ageGroupName,
      seasonName: r.seasonName,
      entryCount: Number(r.entryCount),
    }))
  },

  /**
   * Detail mit allen Einträgen (angereichert mit Member-Daten und
   * Strategy-Display). Optional `onlyActive=true` filtert pausierte Spieler.
   */
  getDetail(id: RankingId, options: { onlyActive?: boolean } = {}): RankingDetailDto {
    const rank = rankingRepo.findById(id)
    if (!rank) throw new RankingNotFoundError(id)

    const meta = useDb()
      .select({
        seasonName: season.name,
        ageGroupName: ageGroup.name,
      })
      .from(ranking)
      .innerJoin(season, eq(ranking.seasonId, season.id))
      .innerJoin(ageGroup, eq(ranking.ageGroupId, ageGroup.id))
      .where(eq(ranking.id, id))
      .get()!

    const rows = rankingEntryRepo.listByRankingWithMember(id)
    const strategy = strategyFor(rank.mode)
    const stats = this.getMatchStats(id)

    const entries: RankingEntryDto[] = rows
      .filter((r) => !options.onlyActive || r.memberStatus === 'aktiv')
      .map((r) => {
        const s = stats.get(r.entry.memberId) ?? { played: 0, won: 0 }
        return {
          id: r.entry.id,
          rankingId: r.entry.rankingId,
          memberId: r.entry.memberId,
          position: r.entry.position,
          points: r.entry.points,
          eloRating: r.entry.eloRating,
          lastMatchAt: r.entry.lastMatchAt,
          matchesPlayed: s.played,
          matchesWon: s.won,
          member: {
            firstName: r.memberFirstName,
            lastName: r.memberLastName,
            dtbLk: r.memberLk,
            status: r.memberStatus,
          },
          display: strategy.getDisplayInfo({
            position: r.entry.position,
            points: r.entry.points,
            eloRating: r.entry.eloRating,
          }),
        }
      })

    return {
      id: rank.id,
      seasonId: rank.seasonId,
      ageGroupId: rank.ageGroupId,
      mode: rank.mode,
      config: rank.config,
      createdAt: rank.createdAt,
      ageGroupName: meta.ageGroupName,
      seasonName: meta.seasonName,
      entries,
    }
  },

  /**
   * Match-Statistik je Mitglied innerhalb einer Rangliste (#73).
   *
   * Zählt bestätigte Match-Ergebnisse, an denen das Mitglied beteiligt
   * war — sowohl als Challenger als auch als Challenged. Walk-Over zählt
   * als Spiel + Sieg für den Anwesenden (winner_id ist gesetzt; der
   * abwesende Verlierer hat zwar „gespielt" im DB-Sinn aber nicht
   * gewonnen — wir liefern die Zahlen, die Strategy entscheidet später,
   * ob das fair ist).
   *
   * Eine Query, In-Memory-Aggregation. Bei einigen 100 Matches pro
   * Saison völlig ausreichend; wenn das pro Page-Load knapp wird, wäre
   * das ein Cache-Kandidat.
   */
  getMatchStats(rankingId: RankingId): Map<MemberId, MemberMatchStats> {
    const rows = useDb()
      .select({
        challengerId: challenge.challengerId,
        challengedId: challenge.challengedId,
        winnerId: matchResult.winnerId,
      })
      .from(matchResult)
      .innerJoin(challenge, eq(matchResult.challengeId, challenge.id))
      .where(
        and(
          eq(challenge.rankingId, rankingId),
          eq(matchResult.confirmationStatus, 'confirmed'),
        ),
      )
      .all()

    const stats = new Map<MemberId, MemberMatchStats>()
    function bump(id: MemberId, didWin: boolean) {
      const cur = stats.get(id) ?? { played: 0, won: 0 }
      cur.played += 1
      if (didWin) cur.won += 1
      stats.set(id, cur)
    }
    for (const r of rows) {
      bump(r.challengerId, r.winnerId === r.challengerId)
      bump(r.challengedId, r.winnerId === r.challengedId)
    }
    return stats
  },

  /**
   * Anzeige-Labels für eine Menge an Ranglisten — `"<AgeGroup> · <Season>"`.
   * Für Aufrufer aus anderen Modulen (z. B. Forderungs-/Friendly-Listen)
   * die Ranking-IDs lesbar darstellen wollen. Eine Query, keine N+1.
   */
  getDisplayNames(ids: RankingId[]): Map<RankingId, string> {
    const out = new Map<RankingId, string>()
    if (ids.length === 0) return out
    const rows = useDb()
      .select({
        id: ranking.id,
        ageGroupName: ageGroup.name,
        seasonName: season.name,
      })
      .from(ranking)
      .innerJoin(ageGroup, eq(ranking.ageGroupId, ageGroup.id))
      .innerJoin(season, eq(ranking.seasonId, season.id))
      .where(inArray(ranking.id, ids))
      .all()
    for (const r of rows) {
      out.set(r.id, `${r.ageGroupName} · ${r.seasonName}`)
    }
    return out
  },

  /**
   * Alle Rangliste-Plätze eines Mitglieds — über alle Saisons.
   * Cross-Modul-Join erlaubt (ADR-005).
   */
  listStandingsForMember(memberId: MemberId): MemberRankingStandingDto[] {
    const rows = useDb()
      .select({
        entry: rankingEntry,
        ranking,
        seasonName: season.name,
        ageGroupName: ageGroup.name,
      })
      .from(rankingEntry)
      .innerJoin(ranking, eq(rankingEntry.rankingId, ranking.id))
      .innerJoin(season, eq(ranking.seasonId, season.id))
      .innerJoin(ageGroup, eq(ranking.ageGroupId, ageGroup.id))
      .where(eq(rankingEntry.memberId, memberId))
      .orderBy(season.createdAt, ageGroup.name)
      .all()

    return rows.map((r) => {
      const strategy = strategyFor(r.ranking.mode)
      return {
        rankingId: r.ranking.id,
        seasonId: r.ranking.seasonId,
        seasonName: r.seasonName,
        ageGroupName: r.ageGroupName,
        mode: r.ranking.mode,
        position: r.entry.position,
        points: r.entry.points,
        eloRating: r.entry.eloRating,
        display: strategy.getDisplayInfo({
          position: r.entry.position,
          points: r.entry.points,
          eloRating: r.entry.eloRating,
        }),
      }
    })
  },
}

