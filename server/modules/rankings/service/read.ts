import { and, eq, sql } from 'drizzle-orm'
import { useDb } from '../../../db'
import { ageGroup } from '../../../db/schema/age-group'
import { ranking } from '../../../db/schema/ranking'
import { rankingEntry } from '../../../db/schema/ranking-entry'
import { season } from '../../../db/schema/season'
import { rankingEntryRepo } from '../repository/ranking-entry-repo'
import { rankingRepo } from '../repository/ranking-repo'
import { strategyFor } from '../strategy'
import {
  RankingNotFoundError,
  type MemberId,
  type MemberRankingStandingDto,
  type RankingDetailDto,
  type RankingEntryDto,
  type RankingId,
  type RankingSummaryDto,
  type RankingVariant,
  type SeasonId,
  type AgeGroupId,
} from '../types'

export type RankingFilter = {
  seasonId?: SeasonId
  ageGroupId?: AgeGroupId
  variant?: RankingVariant
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
    if (filter.variant) wheres.push(eq(ranking.variant, filter.variant))

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
      .orderBy(season.createdAt, ageGroup.name, ranking.variant)
      .all()

    return rows.map((r) => ({
      id: r.ranking.id,
      seasonId: r.ranking.seasonId,
      ageGroupId: r.ranking.ageGroupId,
      variant: r.ranking.variant,
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

    const entries: RankingEntryDto[] = rows
      .filter((r) => !options.onlyActive || r.memberStatus === 'aktiv')
      .map((r) => ({
        id: r.entry.id,
        rankingId: r.entry.rankingId,
        memberId: r.entry.memberId,
        position: r.entry.position,
        points: r.entry.points,
        eloRating: r.entry.eloRating,
        lastMatchAt: r.entry.lastMatchAt,
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
      }))

    return {
      id: rank.id,
      seasonId: rank.seasonId,
      ageGroupId: rank.ageGroupId,
      variant: rank.variant,
      mode: rank.mode,
      config: rank.config,
      createdAt: rank.createdAt,
      ageGroupName: meta.ageGroupName,
      seasonName: meta.seasonName,
      entries,
    }
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
      .orderBy(season.createdAt, ageGroup.name, ranking.variant)
      .all()

    return rows.map((r) => {
      const strategy = strategyFor(r.ranking.mode)
      return {
        rankingId: r.ranking.id,
        seasonId: r.ranking.seasonId,
        seasonName: r.seasonName,
        ageGroupName: r.ageGroupName,
        variant: r.ranking.variant,
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

