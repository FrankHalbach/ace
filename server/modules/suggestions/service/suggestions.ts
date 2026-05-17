import { challengesService } from '../../challenges'
import type { ChallengeDto } from '../../challenges'
import { friendliesService } from '../../friendlies'
import type { FriendlyDetailDto } from '../../friendlies'
import { profileService, type MemberDto, type MemberId } from '../../members'
import {
  getRankingEntries,
  getRankingMeta,
  rankingReadService,
  strategyFor,
  type RankingId,
} from '../../rankings'
import type { SuggestionDto, SuggestionReason } from '../types'

const LK_RANGE = 2 // ±2 LK (FR-101 Default)
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000 // FR-26: 14 Tage
const INACTIVE_THRESHOLD_MS = 28 * 24 * 60 * 60 * 1000 // 4 Wochen (siehe Trainer-Activity)
const TOP_N = 5

export const suggestionsService = {
  /**
   * Berechnet On-Demand bis zu 5 Spielpartner-Vorschläge für `viewerId`.
   * Read-only, kein State, kein Cron. Wenn der Viewer pausiert ist:
   * leere Liste.
   *
   * Algorithmus siehe `docs/features/suggestions/design.md`.
   */
  suggestFor(viewerId: MemberId, now: Date = new Date()): SuggestionDto[] {
    const viewer = profileService.findById(viewerId)
    if (!viewer || viewer.status !== 'aktiv') return []

    // Viewer-Historie einmalig laden. Vorher: in den Helper-Funktionen pro
    // Kandidat erneut gefetched → O(M) redundante listForMember(viewer).
    const viewerChallenges = challengesService.listForMember(viewerId)
    const viewerFriendlies = friendliesService.listForMember(viewerId)

    const allMembers = profileService.listAll()
    const viewerLastMatchAt = lastMatchAt(viewerChallenges, viewerFriendlies)
    const viewerInactive =
      !viewerLastMatchAt || now.getTime() - viewerLastMatchAt.getTime() > INACTIVE_THRESHOLD_MS

    const cooldownSince = new Date(now.getTime() - COOLDOWN_MS)

    const candidates = allMembers
      .filter((m) => m.id !== viewerId)
      .filter((m) => m.status === 'aktiv')
      .filter((m) => Math.abs(m.dtbLk - viewer.dtbLk) <= LK_RANGE)
      .filter((m) => !hasRecentInteractionWith(viewerId, m.id, viewerChallenges, viewerFriendlies, cooldownSince))

    const scored = candidates.map((c) => {
      const lkDiff = Math.abs(c.dtbLk - viewer.dtbLk)
      const candidateLastMatchAt = lastMatchAtForMember(c.id)
      const candidateInactive =
        !candidateLastMatchAt ||
        now.getTime() - candidateLastMatchAt.getTime() > INACTIVE_THRESHOLD_MS
      const havePlayed = havePlayedAgainstFromLists(viewerId, c.id, viewerChallenges, viewerFriendlies)

      let score = 100 - 10 * lkDiff
      if (candidateInactive) score += 50
      if (!havePlayed) score += 30
      if (viewerInactive) score += 20

      const reason: SuggestionReason = candidateInactive
        ? 'inactive-partner'
        : !havePlayed
          ? 'new-pairing'
          : 'similar-strength'

      return { candidate: c, score, reason, lkDiff }
    })

    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, TOP_N)

    return top.map(({ candidate, reason, lkDiff }) => {
      const recommended = pickChallengeRanking(viewer, candidate)
      return {
        memberId: candidate.id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        dtbLk: candidate.dtbLk,
        reason,
        reasonText: reasonText(reason, candidate, lkDiff),
        rankingId: recommended?.rankingId ?? null,
        rankingName: recommended?.rankingName ?? null,
      }
    })
  },
}

function reasonText(reason: SuggestionReason, candidate: MemberDto, lkDiff: number): string {
  switch (reason) {
    case 'inactive-partner':
      return `${candidate.firstName} spielt selten — perfekte Gelegenheit`
    case 'new-pairing':
      return 'Neue Paarung — ihr habt noch nie gegeneinander gespielt'
    case 'similar-strength':
      return `Ähnliche Stärke — LK-Differenz ${lkDiff.toFixed(1)}`
  }
}

function lastMatchAt(challenges: ChallengeDto[], friendlies: FriendlyDetailDto[]): Date | null {
  let latest: Date | null = null
  for (const c of challenges) {
    if (c.status === 'COMPLETED' && c.completedAt) {
      if (!latest || c.completedAt > latest) latest = c.completedAt
    }
  }
  for (const f of friendlies) {
    if (f.status === 'COMPLETED' || f.status === 'PLAYED') {
      const at = f.completedAt ?? f.playedAt
      if (at && (!latest || at > latest)) latest = at
    }
  }
  return latest
}

/** Bequemlichkeit für Kandidaten-Lookup im Scoring-Loop. */
function lastMatchAtForMember(memberId: MemberId): Date | null {
  return lastMatchAt(
    challengesService.listForMember(memberId),
    friendliesService.listForMember(memberId),
  )
}

/**
 * Hat es zwischen den beiden in den letzten 14 Tagen eine Interaktion
 * gegeben (Cooldown FR-26)? Aktive Challenges/Friendlies zählen ebenfalls.
 * Erwartet die Listen aus Sicht von `a` als Parameter — keine eigenen Fetches.
 */
function hasRecentInteractionWith(
  a: MemberId,
  b: MemberId,
  challenges: ChallengeDto[],
  friendlies: FriendlyDetailDto[],
  since: Date,
): boolean {
  for (const c of challenges) {
    const other = c.challengerId === a ? c.challengedId : c.challengerId
    if (other !== b) continue
    if (c.status === 'PROPOSED' || c.status === 'ACCEPTED') return true
    if ((c.status === 'COMPLETED' || c.status === 'DISPUTED') && c.completedAt && c.completedAt >= since) {
      return true
    }
  }
  for (const f of friendlies) {
    const allParticipants = [f.initiatorId, ...f.invitees.map((i) => i.memberId)]
    if (!allParticipants.includes(b)) continue
    if (f.status === 'PROPOSED' || f.status === 'CONFIRMED') return true
    const at = f.completedAt ?? f.playedAt
    if ((f.status === 'COMPLETED' || f.status === 'PLAYED' || f.status === 'DISPUTED') && at && at >= since) {
      return true
    }
  }
  return false
}

/**
 * „Haben die beiden überhaupt schon mal gegeneinander gespielt?" — über
 * alle COMPLETED Challenges + COMPLETED/PLAYED Friendlies. Liest aus den
 * vorgeladenen Listen von `a`.
 */
function havePlayedAgainstFromLists(
  a: MemberId,
  b: MemberId,
  challenges: ChallengeDto[],
  friendlies: FriendlyDetailDto[],
): boolean {
  for (const c of challenges) {
    if (c.status !== 'COMPLETED') continue
    const other = c.challengerId === a ? c.challengedId : c.challengerId
    if (other === b) return true
  }
  for (const f of friendlies) {
    if (f.status !== 'COMPLETED' && f.status !== 'PLAYED') continue
    const allParticipants = [f.initiatorId, ...f.invitees.map((i) => i.memberId)]
    if (allParticipants.includes(b)) return true
  }
  return false
}

/**
 * Liefert die beste gemeinsame Rangliste für eine Challenge:
 *   - beide sind drin
 *   - Strategy.validateChallenge sagt ok
 *   - bei mehreren passenden: kleinste Positions-Differenz
 */
function pickChallengeRanking(
  viewer: MemberDto,
  candidate: MemberDto,
): { rankingId: RankingId; rankingName: string } | null {
  const viewerStandings = rankingReadService.listStandingsForMember(viewer.id)
  const candidateStandings = rankingReadService.listStandingsForMember(candidate.id)
  const candidateRankingIds = new Set(candidateStandings.map((s) => s.rankingId))

  type Cand = { rankingId: RankingId; positionDiff: number; rankingName: string }
  const candidates: Cand[] = []

  for (const vs of viewerStandings) {
    if (!candidateRankingIds.has(vs.rankingId)) continue

    const entries = getRankingEntries(vs.rankingId)
    const viewerEntry = entries.find((e) => e.memberId === viewer.id)
    const candidateEntry = entries.find((e) => e.memberId === candidate.id)
    if (!viewerEntry || !candidateEntry) continue

    const meta = getRankingMeta(vs.rankingId)
    if (!meta) continue
    const strategy = strategyFor(meta.mode)
    // Der „Challenger" muss ranglistentechnisch derjenige sein, der nach
    // oben springt. Pyramide: niedrigere Position = besser, also fordert
    // der mit höherer position den mit niedrigerer.
    const [challenger, challenged] =
      viewerEntry.position > candidateEntry.position
        ? [viewerEntry, candidateEntry]
        : [candidateEntry, viewerEntry]

    const result = strategy.validateChallenge({
      challengerEntry: challenger,
      challengedEntry: challenged,
      config: meta.config,
    })
    if (!result.ok) continue

    candidates.push({
      rankingId: vs.rankingId,
      positionDiff: Math.abs(viewerEntry.position - candidateEntry.position),
      rankingName: vs.ageGroupName,
    })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.positionDiff - b.positionDiff)
  return { rankingId: candidates[0]!.rankingId, rankingName: candidates[0]!.rankingName }
}
