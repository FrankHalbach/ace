import { nanoid } from 'nanoid'
import type { H3Event } from 'h3'

/**
 * Public-ID-Generator: 21-Zeichen-Standard-`nanoid` aus `A-Za-z0-9_-`.
 * ~126 Bit Entropie — kollisionsfrei, kompatibel mit `z.string().nanoid()`.
 *
 * Eingebaut über Drizzles `$defaultFn` in den Top-Entity-Schemas
 * (`member`, `challenge`, `friendly`, `ranking`, `season`).
 */
export function newPublicId(): string {
  return nanoid()
}

// URL-safes nanoid-Alphabet. 16–32 Zeichen: erlaubt 21-Zeichen-Standard
// für neue Inserts und den 16-Hex-Migration-Backfill für Pre-Launch-
// Dev-Daten. Sobald die DB einmal frisch geseedet ist, sind alle IDs
// 21 Zeichen — Pattern auf {21} verschärfen ist dann eine 1-Zeilen-Änderung.
const NANOID_PATTERN = /^[A-Za-z0-9_-]{16,32}$/

/**
 * Parsed eine path-Param-Public-ID und gibt sie als gebrandeten Typ
 * zurück — Beispiel:
 *
 *   const id = requirePublicIdParam<MemberId>(event, 'id')
 *
 * Wirft 400, wenn der Param fehlt oder nicht das nanoid-Format trifft.
 * Existenz-Prüfung (404) macht der Service-Lookup.
 *
 * `H3Event` ist ein reiner Type-Import (wird beim Build elidiert), und
 * `createError` kommt über Nitro-Auto-Imports — beides nötig, damit
 * dieses Modul von tsx-CLI-Skripten (drizzle-kit, db:migrate, db:seed)
 * geladen werden kann, ohne dass h3 als Runtime-Modul aufgelöst wird.
 */
export function requirePublicIdParam<T extends string = string>(
  event: H3Event,
  name: string,
): T {
  const raw = event.context.params?.[name]
  if (!raw || !NANOID_PATTERN.test(raw)) {
    throw createError({
      statusCode: 400,
      statusMessage: `invalid-param:${name}`,
    })
  }
  return raw as T
}
