import { Buffer } from 'node:buffer'
import {
  CsvEncodingError,
  CsvParseError,
  memberAdminService,
  parseMembersCsv,
  type CsvImportError,
} from '../../../modules/members'
import { requireRole } from '../../../shared/require-role'

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB — bei 500 Mitgliedern viel Luft

/**
 * POST /api/admin/members/import — Bulk-CSV-Import (FR-60).
 * Erwartet multipart/form-data mit einem File-Part `file`.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  requireRole(user, 'admin')

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find((p) => p.name === 'file' && p.data)
  if (!filePart) {
    throw createError({ statusCode: 400, statusMessage: 'import.no-file' })
  }
  if (filePart.data.length > MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'import.file-too-large' })
  }

  let result
  try {
    result = parseMembersCsv(Buffer.from(filePart.data))
  } catch (err) {
    if (err instanceof CsvEncodingError) {
      throw createError({
        statusCode: 422,
        statusMessage: 'import.encoding-error',
        data: { message: err.message },
      })
    }
    if (err instanceof CsvParseError) {
      throw createError({
        statusCode: 422,
        statusMessage: 'import.parse-error',
        data: { message: err.message },
      })
    }
    throw err
  }

  // Falls die CSV strukturell OK ist, aber alle Zeilen Validierungs-Fehler
  // haben, importieren wir trotzdem nichts — der Caller bekommt das Report-
  // Objekt und kann entscheiden.
  const { importedIds, skippedEmails } = memberAdminService.bulkCreate(
    result.rows,
    user.memberId,
  )

  const report: {
    imported: number
    skipped: number
    skippedEmails: string[]
    errors: CsvImportError[]
  } = {
    imported: importedIds.length,
    skipped: skippedEmails.length,
    skippedEmails,
    errors: result.errors,
  }

  return report
})
