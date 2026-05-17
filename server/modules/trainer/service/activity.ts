import { eq, inArray } from 'drizzle-orm'
import { useDb } from '../../../db'
import { challenge } from '../../../db/schema/challenge'
import { friendly, type FriendlyId } from '../../../db/schema/friendly'
import { friendlyInvitee } from '../../../db/schema/friendly-invitee'
import { profileService, type MemberId } from '../../members'
import type { ActivityOverviewRow } from '../types'

const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000

/**
 * Vereinsweite Aktivitäts-Übersicht.
 *
 * Pro Mitglied: letzte Match-Aktivität (max aus completed Challenges +
 * completed/played Friendlies + member.lastFriendlyAt-Stempel) und Anzahl
 * Matches in den letzten 4 Wochen. Sortiert ascending nach lastMatchAt
 * (NULL zuerst), damit Inaktive oben stehen.
 *
 * v1: für ~500 Mitglieder reicht naive Aggregation in TS. Bei merklichem
 * Wachstum: Caching oder pre-aggregierte View.
 */
export const trainerActivityService = {
  overview(now: Date = new Date()): ActivityOverviewRow[] {
    const cutoff = new Date(now.getTime() - FOUR_WEEKS_MS)

    const members = profileService.listAll()

    const completedChallenges = useDb()
      .select({
        challengerId: challenge.challengerId,
        challengedId: challenge.challengedId,
        completedAt: challenge.completedAt,
      })
      .from(challenge)
      .where(eq(challenge.status, 'COMPLETED'))
      .all()

    // Friendlies in PLAYED oder COMPLETED — beide zählen für Aktivität (FR-93).
    const matchedFriendlies = useDb()
      .select({
        id: friendly.id,
        initiatorId: friendly.initiatorId,
        completedAt: friendly.completedAt,
        playedAt: friendly.playedAt,
      })
      .from(friendly)
      .where(inArray(friendly.status, ['COMPLETED', 'PLAYED']))
      .all()

    const friendlyIds = matchedFriendlies.map((f) => f.id)
    const allInvitees = friendlyIds.length === 0
      ? []
      : useDb()
          .select({
            friendlyId: friendlyInvitee.friendlyId,
            memberId: friendlyInvitee.memberId,
          })
          .from(friendlyInvitee)
          .where(inArray(friendlyInvitee.friendlyId, friendlyIds))
          .all()

    // Map: friendlyId → (timestamp, participants)
    const friendlyById = new Map<
      FriendlyId,
      { at: Date; participants: Set<MemberId> }
    >()
    for (const f of matchedFriendlies) {
      const at = (f.completedAt ?? f.playedAt) as Date | null
      if (!at) continue
      friendlyById.set(f.id, { at, participants: new Set([f.initiatorId]) })
    }
    for (const i of allInvitees) {
      const entry = friendlyById.get(i.friendlyId)
      if (entry) entry.participants.add(i.memberId)
    }

    return members
      .map((m): ActivityOverviewRow => {
        let lastMatchAt: Date | null = null
        let matchesLast4Weeks = 0

        for (const c of completedChallenges) {
          if (c.challengerId !== m.id && c.challengedId !== m.id) continue
          if (!c.completedAt) continue
          if (!lastMatchAt || c.completedAt > lastMatchAt) lastMatchAt = c.completedAt
          if (c.completedAt >= cutoff) matchesLast4Weeks++
        }

        for (const [, entry] of friendlyById) {
          if (!entry.participants.has(m.id)) continue
          if (!lastMatchAt || entry.at > lastMatchAt) lastMatchAt = entry.at
          if (entry.at >= cutoff) matchesLast4Weeks++
        }

        return {
          memberId: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
          status: m.status,
          lastMatchAt,
          matchesLast4Weeks,
        }
      })
      .sort((a, b) => {
        if (a.lastMatchAt === null && b.lastMatchAt === null) return 0
        if (a.lastMatchAt === null) return -1
        if (b.lastMatchAt === null) return 1
        return a.lastMatchAt.getTime() - b.lastMatchAt.getTime()
      })
  },
}
