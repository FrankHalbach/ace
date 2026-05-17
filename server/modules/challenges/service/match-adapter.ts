/**
 * Bridge zwischen Domain (`shared/domain/challenge/`) und Persistierung.
 *
 *   const match = loadChallenge(id)               ← lädt + dispatcht in State-Klasse
 *   if (!(match instanceof ProposedChallenge)) ... ← Type-Narrowing
 *   const mutation = match.accept(actor, now)     ← Domain-Befehl
 *   applyChallengeMutation(mutation)              ← Persistiert atomisch
 */
import { eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import { challenge } from '../../../db/schema/challenge'
import { challengeFromRow } from '../../../../shared/domain/challenge/factory'
import type { ChallengeMatch, ChallengeMutation } from '../../../../shared/domain/challenge'
import type { ChallengeId } from '../../../db/schema/challenge'
import { challengeRepo } from '../repository/challenge-repo'
import { ChallengeNotFoundError } from '../types'

export function loadChallenge(id: ChallengeId): ChallengeMatch {
  const row = challengeRepo.findById(id)
  if (!row) throw new ChallengeNotFoundError(id)
  return challengeFromRow(row)
}

export function applyChallengeMutation(mutation: ChallengeMutation): void {
  const db = useDb()
  switch (mutation.kind) {
    case 'accept-challenge': {
      db.update(challenge)
        .set({ status: 'ACCEPTED', acceptedAt: mutation.at })
        .where(eq(challenge.id, mutation.challengeId))
        .run()
      break
    }
    case 'decline-challenge': {
      db.update(challenge)
        .set({
          status: 'DECLINED',
          declinedAt: mutation.at,
          declineReason: mutation.reason,
          declineNote: mutation.note,
        })
        .where(eq(challenge.id, mutation.challengeId))
        .run()
      break
    }
    case 'expire-challenge': {
      db.update(challenge)
        .set({ status: 'EXPIRED', expiredAt: mutation.at })
        .where(eq(challenge.id, mutation.challengeId))
        .run()
      break
    }
    case 'mark-completed': {
      db.update(challenge)
        .set({ status: 'COMPLETED', completedAt: mutation.at })
        .where(eq(challenge.id, mutation.challengeId))
        .run()
      break
    }
    case 'mark-disputed': {
      db.update(challenge)
        .set({ status: 'DISPUTED', disputedAt: mutation.at })
        .where(eq(challenge.id, mutation.challengeId))
        .run()
      break
    }
    case 'trainer-cancel': {
      db.update(challenge)
        .set({ status: 'CANCELLED', cancelledAt: mutation.at })
        .where(eq(challenge.id, mutation.challengeId))
        .run()
      break
    }
  }
}
