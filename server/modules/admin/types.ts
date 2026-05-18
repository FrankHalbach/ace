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
