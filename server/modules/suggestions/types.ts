import type { MemberId } from '../members'
import type { RankingId } from '../rankings'

export type SuggestionReason = 'inactive-partner' | 'new-pairing' | 'similar-strength'

export type SuggestionDto = {
  memberId: MemberId
  firstName: string
  lastName: string
  dtbLk: number
  reason: SuggestionReason
  reasonText: string
  /** Empfohlene Rangliste für eine Challenge — null wenn keine passt. */
  rankingId: RankingId | null
  rankingName: string | null
}
