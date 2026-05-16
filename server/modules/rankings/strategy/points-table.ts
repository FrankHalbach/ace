import { z } from 'zod'
import type { MemberDto, MemberId } from '../../members'
import type {
  ApplyResultInput,
  DisplayInfo,
  EntryDisplayInput,
  InitialEntryFields,
  InitialOrderInput,
  RankingMutation,
  RankingStrategy,
  ValidateChallengeInput,
  ValidationResult,
} from './types'

/**
 * Default-Punktwerte aus N-01 (Spec-Nachtrag „Punkte-Tabelle als zusätzlicher
 * Wertungs-Modus").
 */
const DEFAULT_POINT_VALUES = {
  challengeWin: 3,
  challengeLoss: 1,
  friendlyWin: 2,
  friendlyLoss: 1,
  friendlyNoResult: 1,
  walkoverWin: 2,
  diversityBonus: 1,
}

const pointValuesSchema = z.object({
  challengeWin: z.number().int().min(0).max(20),
  challengeLoss: z.number().int().min(0).max(20),
  friendlyWin: z.number().int().min(0).max(20),
  friendlyLoss: z.number().int().min(0).max(20),
  friendlyNoResult: z.number().int().min(0).max(20),
  walkoverWin: z.number().int().min(0).max(20),
  diversityBonus: z.number().int().min(0).max(20),
})

export const pointsTableStrategy: RankingStrategy = {
  mode: 'points-table',

  defaultConfig() {
    return { pointValues: { ...DEFAULT_POINT_VALUES } }
  },

  configSchema: z.object({
    pointValues: pointValuesSchema.default(DEFAULT_POINT_VALUES),
  }),

  /**
   * Punkte-Tabelle: alle starten bei 0 Punkten. Initial-Reihenfolge ergibt
   * sich nach LK aufsteigend (Tiebreaker). Übergangs-Strategien aus FR-15a
   * werden ignoriert — Punkte beginnen jede Saison frisch.
   */
  getInitialOrder(input: InitialOrderInput): MemberId[] {
    return [...input.members]
      .sort((a, b) => {
        if (a.dtbLk !== b.dtbLk) return a.dtbLk - b.dtbLk
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      })
      .map((m) => m.id)
  },

  initialEntryFields(_member: MemberDto): InitialEntryFields {
    return { points: 0, eloRating: null }
  },

  getDisplayInfo(entry: EntryDisplayInput): DisplayInfo {
    return {
      primary: `${entry.points ?? 0} Pkt`,
      secondary: `#${entry.position}`,
    }
  },

  validateChallenge(_input: ValidateChallengeInput): ValidationResult {
    return { ok: true }
  },

  /**
   * Punkte-Tabelle (N-01):
   *   - Sieger bekommt `challengeWin` Punkte
   *   - Verlierer bekommt `challengeLoss` Punkte
   *   - Positionen werden neu vergeben nach Punkte absteigend, LK aufsteigend
   *     als Tiebreaker, ID aufsteigend als letzter Tiebreaker
   *   - MatchPointsAward-Einträge werden für Audit/Historie erzeugt
   */
  applyResult(input: ApplyResultInput): RankingMutation[] {
    const { winnerId, loserId, challengerEntry, challengedEntry, allEntries, config, now, outcome } = input
    const pv = config.pointValues ?? DEFAULT_POINT_VALUES

    const winnerEntry = winnerId === challengerEntry.memberId ? challengerEntry : challengedEntry
    const loserEntry = loserId === challengerEntry.memberId ? challengerEntry : challengedEntry

    // Walk-Over: Sieger bekommt walkoverWin, Verlierer bekommt nichts (war
    // nicht da). Aufgabe: voller challengeWin/challengeLoss (beide waren da).
    const isWalkover = outcome === 'walkover'
    const winnerGain = isWalkover ? pv.walkoverWin : pv.challengeWin
    const loserGain = isWalkover ? 0 : pv.challengeLoss
    const winnerReason: 'walkover-win' | 'challenge-win' = isWalkover ? 'walkover-win' : 'challenge-win'

    const newWinnerPoints = (winnerEntry.points ?? 0) + winnerGain
    const newLoserPoints = (loserEntry.points ?? 0) + loserGain

    const mutations: RankingMutation[] = [
      { kind: 'set-points', entryId: winnerEntry.id, points: newWinnerPoints },
      { kind: 'set-points', entryId: loserEntry.id, points: newLoserPoints },
      { kind: 'set-last-match', entryId: winnerEntry.id, at: now },
      { kind: 'set-last-match', entryId: loserEntry.id, at: now },
      {
        kind: 'award-points',
        memberId: winnerEntry.memberId,
        rankingEntryId: winnerEntry.id,
        points: winnerGain,
        reason: winnerReason,
      },
    ]
    if (loserGain > 0) {
      mutations.push({
        kind: 'award-points',
        memberId: loserEntry.memberId,
        rankingEntryId: loserEntry.id,
        points: loserGain,
        reason: 'challenge-loss',
      })
    }

    // Positionen neu berechnen — nach Punkten absteigend, ID als Tiebreaker
    const newPoints = new Map<number, number>()
    for (const e of allEntries) newPoints.set(e.id, e.points ?? 0)
    newPoints.set(winnerEntry.id, newWinnerPoints)
    newPoints.set(loserEntry.id, newLoserPoints)

    const reordered = [...allEntries].sort((a, b) => {
      const pa = newPoints.get(a.id)!
      const pb = newPoints.get(b.id)!
      if (pa !== pb) return pb - pa
      if (a.memberLk !== b.memberLk) return a.memberLk - b.memberLk
      return a.id - b.id
    })

    reordered.forEach((entry, idx) => {
      const newPos = idx + 1
      if (entry.position !== newPos) {
        mutations.push({ kind: 'set-position', entryId: entry.id, position: newPos })
      }
    })

    return mutations
  },
}
