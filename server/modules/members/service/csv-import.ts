import { z } from 'zod'

/**
 * Schmaler CSV-Parser für den initialen Mitglieder-Import (FR-60).
 *
 * Bewusst keine externe Dependency: das Format ist gut definiert
 * (UTF-8, `;`- oder `,`-getrennt, optional gequotete Felder),
 * der Aufwand bleibt überschaubar.
 */

export type CsvImportError =
  | { row: number; code: 'import.row-validation-failed'; message: string }

export type CsvParseResult<T> = {
  rows: T[]
  errors: CsvImportError[]
}

/**
 * Roher Zeilen-Datensatz aus der CSV — Strings, bevor sie durch Zod laufen.
 */
type RawRow = Record<string, string>

const REQUIRED_HEADERS = [
  'firstName',
  'lastName',
  'birthYear',
  'gender',
  'email',
  'dtbLk',
] as const

const currentYear = new Date().getFullYear()

/**
 * Pro-Zeile-Validierung. Trim auf Namen, lowercase + trim auf email,
 * birthYear/dtbLk in Zahlen wandeln.
 */
export const importRowSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  birthYear: z.coerce.number().int().gte(1920).lte(currentYear),
  gender: z.enum(['m', 'w']),
  email: z.string().trim().toLowerCase().email().max(120),
  dtbLk: z.coerce.number().min(1).max(25),
})

export type ImportRow = z.infer<typeof importRowSchema>

export class CsvParseError extends Error {
  readonly code = 'import.parse-error' as const
  constructor(message: string) {
    super(message)
  }
}

export class CsvEncodingError extends Error {
  readonly code = 'import.encoding-error' as const
  constructor() {
    super(
      'CSV ist nicht UTF-8 — bitte als „CSV UTF-8 (durch Trennzeichen getrennt) (*.csv)" speichern.',
    )
  }
}

/**
 * Dekodiert einen Buffer als UTF-8. Wirft `CsvEncodingError`, wenn
 * ungültige Byte-Sequenzen vorliegen (z. B. Windows-1252-Umlaute).
 */
function decodeUtf8(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new CsvEncodingError()
  }
}

/**
 * Tokenisiert eine CSV nach RFC-4180-artigen Regeln:
 * - Felder können in `"..."` gequotet werden.
 * - Innerhalb eines Quotings ist `""` ein escaped Quote.
 * - Außerhalb von Quotings sind \n und \r\n Zeilen-Trenner.
 *
 * Liefert eine Liste von Zeilen, jeweils Liste von Feld-Strings.
 */
function tokenize(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === delimiter) {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      // \r\n als \n behandeln, einsames \r ignorieren
      if (text[i + 1] === '\n') i += 2
      else i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      continue
    }
    if (ch === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      i++
      continue
    }
    field += ch
    i++
  }
  // Letztes Feld + Zeile, sofern nicht leer
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function detectDelimiter(firstLine: string): ';' | ',' {
  const semi = firstLine.split(';').length
  const comma = firstLine.split(',').length
  return semi >= comma ? ';' : ','
}

/**
 * Parst eine CSV-Datei in validierte Import-Zeilen + Fehler-Liste.
 *
 * - Strippt optionales UTF-8-BOM
 * - Erkennt Trennzeichen automatisch (`;` zuerst, dann `,`)
 * - Validiert Header gegen `REQUIRED_HEADERS` (alle Pflicht, Reihenfolge egal)
 * - Validiert Datenzeilen via Zod
 *
 * Reihen-Zähler ist 1-basiert und entspricht der Zeile in der Datei
 * inkl. Header (Header = Zeile 1, erste Datenzeile = 2).
 */
export function parseMembersCsv(buffer: Buffer): CsvParseResult<ImportRow> {
  let text = decodeUtf8(buffer)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  if (text.trim().length === 0) {
    throw new CsvParseError('CSV ist leer.')
  }

  const firstNewline = (() => {
    const idx = text.indexOf('\n')
    return idx === -1 ? text.length : idx
  })()
  const firstLine = text.slice(0, firstNewline)
  const delimiter = detectDelimiter(firstLine)

  const matrix = tokenize(text, delimiter)
  if (matrix.length === 0) {
    throw new CsvParseError('CSV enthält keine Zeilen.')
  }

  const header = matrix[0]!.map((c) => c.trim())
  const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h))
  if (missing.length > 0) {
    throw new CsvParseError(
      `Header unvollständig — fehlt: ${missing.join(', ')}. Erwartet: ${REQUIRED_HEADERS.join(delimiter)}`,
    )
  }
  const headerIndex = new Map<string, number>()
  header.forEach((name, idx) => headerIndex.set(name, idx))

  const rows: ImportRow[] = []
  const errors: CsvImportError[] = []

  for (let i = 1; i < matrix.length; i++) {
    const cols = matrix[i]!
    // Komplett leere Zeilen überspringen
    if (cols.every((c) => c.trim() === '')) continue

    const raw: RawRow = {}
    for (const name of REQUIRED_HEADERS) {
      const idx = headerIndex.get(name)!
      raw[name] = (cols[idx] ?? '').trim()
    }

    const parsed = importRowSchema.safeParse(raw)
    if (parsed.success) {
      rows.push(parsed.data)
    } else {
      const issue = parsed.error.issues[0]
      const field = issue?.path[0] ?? 'unbekannt'
      const reason = issue?.message ?? 'invalid'
      errors.push({
        row: i + 1, // 1-basierter Zeilenindex
        code: 'import.row-validation-failed',
        message: `Spalte „${String(field)}": ${reason}`,
      })
    }
  }

  return { rows, errors }
}
