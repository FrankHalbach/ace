import { challengesService, type ChallengeId } from '../../challenges'
import { friendliesService, friendlyResultsService } from '../../friendlies'
import { rankingReadService } from '../../rankings'
import { resultsService } from '../../results'
import { profileService, MemberNotFoundError } from './profile'
import type { MemberId, PlayerProfileDto } from '../types'

const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000
const MATCH_HISTORY_LIMIT = 50

/**
 * Liefert ein voll aggregiertes Spieler-Profil: Profil-Basics, aktuelle
 * Ranglisten-Positionen und Match-Historie. Aufgerufen via
 * `GET /api/members/:id/profile`.
 *
 * Sichtbarkeit v1: jeder eingeloggte sieht alles **außer Email**, die
 * bleibt nur dem Profil-Inhaber sichtbar (FR-7-Defaults kommen mit dem
 * `profile-visibility`-Feature). `viewerId` ist die memberId der aktuellen
 * Session und wird nur für den Email-Check gebraucht.
 */
export function getMemberProfile(id: MemberId, viewerId: MemberId): PlayerProfileDto {
  const member = profileService.findById(id)
  if (!member) throw new MemberNotFoundError(id)

  // ─── Aktivität (analog trainer.activity, aber nur dieser eine Member) ────
  const now = new Date()
  const cutoff = new Date(now.getTime() - FOUR_WEEKS_MS)

  const myChallenges = challengesService
    .listForMember(id)
    .filter((c) => c.status === 'COMPLETED' && c.completedAt !== null)

  const myFriendliesAll = friendliesService
    .listForMember(id)
    .filter((f) => f.status === 'COMPLETED' || f.status === 'PLAYED')

  let lastMatchAt: Date | null = null
  let matchesLast4Weeks = 0

  for (const c of myChallenges) {
    if (!c.completedAt) continue
    if (!lastMatchAt || c.completedAt > lastMatchAt) lastMatchAt = c.completedAt
    if (c.completedAt >= cutoff) matchesLast4Weeks++
  }
  for (const f of myFriendliesAll) {
    const at = f.completedAt ?? f.playedAt
    if (!at) continue
    if (!lastMatchAt || at > lastMatchAt) lastMatchAt = at
    if (at >= cutoff) matchesLast4Weeks++
  }

  // ─── Aktuelle Ranglisten-Positionen ───────────────────────────────────────
  const standings = rankingReadService.listStandingsForMember(id)
  const rankings = standings.map((s) => {
    const detail = rankingReadService.getDetail(s.rankingId)
    return {
      rankingId: s.rankingId,
      seasonName: s.seasonName,
      ageGroupName: s.ageGroupName,
      mode: s.mode,
      position: s.position,
      entryCount: detail.entries.length,
    }
  })

  // ─── Match-Historie ──────────────────────────────────────────────────────
  type HistoryItem = PlayerProfileDto['matches'][number]
  const items: Array<HistoryItem & { sortAt: Date }> = []

  for (const c of myChallenges) {
    if (!c.completedAt) continue
    const result = resultsService.findForChallenge(c.id as ChallengeId)
    const opponentId = c.challengerId === id ? c.challengedId : c.challengerId
    const opponent = profileService.findById(opponentId)
    items.push({
      kind: 'challenge',
      challengeId: c.id,
      rankingName: rankingNameFromStanding(rankings, c.rankingId),
      opponentId,
      opponentName: opponent ? `${opponent.firstName} ${opponent.lastName}` : `#${opponentId}`,
      result: result?.winnerId === id ? 'win' : 'loss',
      sets: result?.sets ?? [],
      completedAt: c.completedAt,
      sortAt: c.completedAt,
    })
  }

  for (const f of myFriendliesAll) {
    const at = f.completedAt ?? f.playedAt
    if (!at) continue
    const result = friendlyResultsService.findForFriendly(f.id)

    const initiatorTeam = [f.initiatorId, ...f.invitees.filter((i) => i.team === 'initiator').map((i) => i.memberId)]
    const opponentTeam = f.invitees.filter((i) => i.team === 'opponent').map((i) => i.memberId)
    const myTeam = initiatorTeam.includes(id) ? initiatorTeam : opponentTeam
    const otherTeam = myTeam === initiatorTeam ? opponentTeam : initiatorTeam

    const partnerId = f.format === 'doubles' ? myTeam.find((mid) => mid !== id) ?? null : null
    const partner = partnerId !== null ? profileService.findById(partnerId) : null
    const opponentNames = otherTeam.map((mid) => {
      const m = profileService.findById(mid)
      return m ? `${m.firstName} ${m.lastName}` : `#${mid}`
    })

    let resultLabel: 'win' | 'loss' | null = null
    if (result?.winnerMemberIds && result.confirmationStatus === 'confirmed') {
      resultLabel = result.winnerMemberIds.includes(id) ? 'win' : 'loss'
    }

    items.push({
      kind: 'friendly',
      friendlyId: f.id,
      format: f.format,
      partnerId,
      partnerName: partner ? `${partner.firstName} ${partner.lastName}` : null,
      opponentIds: otherTeam,
      opponentNames,
      result: resultLabel,
      sets: result?.sets ?? [],
      playedOrCompletedAt: at,
      sortAt: at,
    })
  }

  items.sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime())
  const matches = items.slice(0, MATCH_HISTORY_LIMIT).map(({ sortAt, ...rest }) => {
    void sortAt
    return rest as HistoryItem
  })

  return {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    birthYear: member.birthYear,
    gender: member.gender,
    dtbLk: member.dtbLk,
    status: member.status,
    email: viewerId === member.id ? member.email : null,
    lastMatchAt,
    matchesLast4Weeks,
    rankings,
    matches,
  }
}

function rankingNameFromStanding(
  rankings: PlayerProfileDto['rankings'],
  rankingId: number,
): string {
  const r = rankings.find((x) => x.rankingId === rankingId)
  if (!r) return `#${rankingId}`
  return r.ageGroupName
}

