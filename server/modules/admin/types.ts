import { z } from 'zod'
import type { MemberId } from '../members'
import type {
  AuditAction,
  AuditEntryId,
  AuditSubjectKind,
} from '../../db/schema/audit-entry'

export type { AuditAction, AuditEntryId, AuditSubjectKind }

export type AuditLogInput = {
  actorId: MemberId
  action: AuditAction
  subjectKind?: AuditSubjectKind
  subjectId?: string
  before?: unknown
  after?: unknown
  note?: string
}

export type AuditEntryDto = {
  id: AuditEntryId
  actorId: MemberId
  action: AuditAction
  subjectKind: AuditSubjectKind | null
  subjectId: string | null
  before: unknown
  after: unknown
  note: string | null
  createdAt: Date
}

/**
 * Zulässige Werte aus dem Enum — die Quelle bleibt das DB-Schema, hier
 * für Zod-Validation des Filter-Inputs gespiegelt.
 */
const auditActionValues = [
  'member.role-changed',
  'member.deactivated',
  'member.reactivated',
  'member.lk-corrected',
  'member.invited',
  'member.imported',
  'member.created',
  'member.team-tags-changed',
  'team-tag.created',
  'team-tag.renamed',
  'team-tag.deleted',
  'result.corrected',
  'result.dispute-decided',
  'challenge.cancelled-by-trainer',
  'friendly.cancelled-by-trainer',
] as const satisfies readonly AuditAction[]

const auditSubjectKindValues = [
  'member',
  'challenge',
  'friendly',
  'result',
  'team-tag',
] as const satisfies readonly AuditSubjectKind[]

export const auditLogQueryInput = z.object({
  action: z.enum(auditActionValues).optional(),
  actorId: z.string().min(1).optional(),
  subjectKind: z.enum(auditSubjectKindValues).optional(),
  subjectId: z.string().min(1).optional(),
  /** ISO-String oder Millis; serverseitig in Date geparst. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Opaker Cursor aus vorheriger Response (`nextCursor`). */
  cursor: z.string().min(1).optional(),
  /** Default 50, max 200. */
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export type AuditLogQueryInput = z.infer<typeof auditLogQueryInput>

export type AuditLogEntryDto = {
  id: AuditEntryId
  actor: {
    id: MemberId
    firstName: string
    lastName: string
  }
  action: AuditAction
  subjectKind: AuditSubjectKind | null
  subjectId: string | null
  /** Server-aufgelöstes Label, z. B. "Tom Weber" oder "Mannschaft 1. Herren". */
  subjectLabel: string | null
  before: unknown
  after: unknown
  note: string | null
  createdAt: Date
}

export type AuditLogPageDto = {
  entries: AuditLogEntryDto[]
  /** Token für die nächste Seite — null, wenn das Ende erreicht ist. */
  nextCursor: string | null
}

export class InvalidAuditCursorError extends Error {
  readonly code = 'audit.invalid-cursor' as const
  constructor() {
    super('invalid audit-log cursor')
  }
}
