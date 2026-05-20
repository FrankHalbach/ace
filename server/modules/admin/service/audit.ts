import { inArray } from 'drizzle-orm'
import { useDb } from '../../../db'
import { member, type MemberId } from '../../../db/schema/member'
import { teamTag } from '../../../db/schema/team-tag'
import { auditRepo, type AuditCursor } from '../repository/audit-repo'
import {
  InvalidAuditCursorError,
  type AuditEntryDto,
  type AuditLogEntryDto,
  type AuditLogInput,
  type AuditLogPageDto,
  type AuditLogQueryInput,
} from '../types'
import type { AuditEntryRow } from '../../../db/schema/audit-entry'

function toDto(row: AuditEntryRow): AuditEntryDto {
  return {
    id: row.id,
    actorId: row.actorId,
    action: row.action,
    subjectKind: row.subjectKind,
    subjectId: row.subjectId,
    before: row.before,
    after: row.after,
    note: row.note,
    createdAt: row.createdAt,
  }
}

function encodeCursor(c: AuditCursor): string {
  const payload = JSON.stringify({ t: c.createdAt.getTime(), i: c.id })
  return Buffer.from(payload, 'utf8').toString('base64url')
}

function decodeCursor(token: string): AuditCursor {
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as { t: unknown; i: unknown }
    if (typeof parsed.t !== 'number' || typeof parsed.i !== 'string') {
      throw new InvalidAuditCursorError()
    }
    return { createdAt: new Date(parsed.t), id: parsed.i }
  } catch (err) {
    if (err instanceof InvalidAuditCursorError) throw err
    throw new InvalidAuditCursorError()
  }
}

/**
 * Sammelt Actor-Namen + Member-Subjects in einer Query. Mit ≤500 Mitgliedern
 * im Verein ist `inArray`-Lookup unkritisch — kein N+1.
 */
function loadMemberLabels(ids: ReadonlySet<string>): Map<string, string> {
  if (ids.size === 0) return new Map()
  const rows = useDb()
    .select({ id: member.id, firstName: member.firstName, lastName: member.lastName })
    .from(member)
    .where(inArray(member.id, [...ids] as MemberId[]))
    .all()
  return new Map(rows.map((r) => [r.id, `${r.firstName} ${r.lastName}`]))
}

function loadTeamTagLabels(ids: ReadonlySet<string>): Map<string, string> {
  if (ids.size === 0) return new Map()
  const rows = useDb()
    .select({ id: teamTag.id, name: teamTag.name })
    .from(teamTag)
    .where(inArray(teamTag.id, [...ids]))
    .all()
  return new Map(rows.map((r) => [r.id, r.name]))
}

export const auditService = {
  /**
   * Schreibt einen Audit-Eintrag. Wird von `admin`, `trainer`, später
   * `results` und `rankings` aufgerufen, sobald sie korrektur-artige
   * Aktionen ausführen.
   *
   * Bewusst synchron — die Schreib-Operation soll im selben
   * Transaction-Kontext der aufrufenden Mutation laufen.
   */
  log(input: AuditLogInput): AuditEntryDto {
    const row = auditRepo.insert({
      actorId: input.actorId,
      action: input.action,
      subjectKind: input.subjectKind ?? null,
      subjectId: input.subjectId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      note: input.note ?? null,
    })
    return toDto(row)
  },

  listRecent(limit?: number): AuditEntryDto[] {
    return auditRepo.listRecent(limit).map(toDto)
  },

  /**
   * Filterbare Audit-Liste mit Cursor-Pagination und Subject-Label-
   * Resolution. UI-Konsumenten brauchen Klartext-Labels statt nackter
   * Public-IDs — Member und Team-Tags lösen wir direkt auf, für
   * Challenges/Friendlies/Results bleibt's bei einem `#<short-id>`-
   * Platzhalter (Deep-Link-Auflösung kommt mit Phase 2).
   */
  listFiltered(query: AuditLogQueryInput): AuditLogPageDto {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined
    const rows = auditRepo.listFiltered(
      {
        action: query.action,
        actorId: query.actorId as MemberId | undefined,
        subjectKind: query.subjectKind,
        subjectId: query.subjectId,
        from: query.from,
        to: query.to,
      },
      cursor,
      query.limit,
    )

    // limit + 1 abgefragt → nächster Eintrag wird abgeschnitten und zum
    // Cursor-Quell-Marker.
    const hasMore = rows.length > query.limit
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows

    // Actor + Member-Subjects → ein Member-Lookup. Team-Tag-Subjects → ein
    // Team-Tag-Lookup. Andere Subject-Kinds bleiben labellos (Fallback).
    const memberIds = new Set<string>()
    const tagIds = new Set<string>()
    for (const row of pageRows) {
      memberIds.add(row.actorId)
      if (row.subjectKind === 'member' && row.subjectId) memberIds.add(row.subjectId)
      if (row.subjectKind === 'team-tag' && row.subjectId) tagIds.add(row.subjectId)
    }
    const memberLabels = loadMemberLabels(memberIds)
    const tagLabels = loadTeamTagLabels(tagIds)

    const entries: AuditLogEntryDto[] = pageRows.map((row) => {
      const actorName = memberLabels.get(row.actorId) ?? row.actorId
      const [firstName, ...rest] = actorName.split(' ')
      const lastName = rest.join(' ')
      let subjectLabel: string | null = null
      if (row.subjectId) {
        if (row.subjectKind === 'member') {
          subjectLabel = memberLabels.get(row.subjectId) ?? row.subjectId
        } else if (row.subjectKind === 'team-tag') {
          subjectLabel = tagLabels.get(row.subjectId) ?? row.subjectId
        } else {
          subjectLabel = `#${row.subjectId.slice(-6)}`
        }
      }
      return {
        id: row.id,
        actor: {
          id: row.actorId,
          firstName: firstName ?? '',
          lastName: lastName ?? '',
        },
        action: row.action,
        subjectKind: row.subjectKind,
        subjectId: row.subjectId,
        subjectLabel,
        before: row.before,
        after: row.after,
        note: row.note,
        createdAt: row.createdAt,
      }
    })

    const last = pageRows[pageRows.length - 1]
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null

    return { entries, nextCursor }
  },
}
