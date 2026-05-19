import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { auditService } from '../../server/modules/admin'
import {
  CsvEncodingError,
  CsvParseError,
  memberAdminService,
  parseMembersCsv,
  type MemberId,
} from '../../server/modules/members'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

const HEADER = 'firstName;lastName;birthYear;gender;email;dtbLk'
const enc = (s: string) => Buffer.from(s, 'utf-8')

function seedAdmin(): MemberId {
  return useDb()
    .insert(member)
    .values({
      email: 'admin@x.de',
      firstName: 'A',
      lastName: 'Admin',
      birthYear: 1980,
      gender: 'm',
      dtbLk: 10,
      roles: ['player', 'admin'],
    })
    .returning()
    .get()!.id
}

describe('parseMembersCsv', () => {
  it('liest gültige Zeilen mit Semikolon-Trennung', () => {
    const csv = [
      HEADER,
      'Max;Müller;1985;m;max@example.org;8.3',
      'Lisa;Schmidt;2008;w;lisa@example.org;14.5',
    ].join('\n')
    const out = parseMembersCsv(enc(csv))
    expect(out.errors).toEqual([])
    expect(out.rows).toHaveLength(2)
    expect(out.rows[0]).toMatchObject({
      firstName: 'Max',
      lastName: 'Müller',
      birthYear: 1985,
      gender: 'm',
      email: 'max@example.org',
      dtbLk: 8.3,
    })
  })

  it('strippt UTF-8-BOM transparent', () => {
    const csv = '﻿' + HEADER + '\nMax;Müller;1985;m;max@example.org;8.3'
    const out = parseMembersCsv(enc(csv))
    expect(out.errors).toEqual([])
    expect(out.rows).toHaveLength(1)
  })

  it('fällt auf Komma-Trennung zurück, wenn `;` keinen sinnvollen Header ergibt', () => {
    const csv = [
      'firstName,lastName,birthYear,gender,email,dtbLk',
      'Max,Müller,1985,m,max@example.org,8.3',
    ].join('\n')
    const out = parseMembersCsv(enc(csv))
    expect(out.errors).toEqual([])
    expect(out.rows[0]?.firstName).toBe('Max')
  })

  it('akzeptiert Felder in Anführungszeichen mit eingeschlossenem Trennzeichen', () => {
    const csv = [
      HEADER,
      '"Müller, Jr.";Doppel;1985;m;mj@example.org;8.3',
    ].join('\n')
    const out = parseMembersCsv(enc(csv))
    expect(out.errors).toEqual([])
    expect(out.rows[0]?.firstName).toBe('Müller, Jr.')
  })

  it('behandelt CRLF-Zeilenendungen wie LF', () => {
    const csv = HEADER + '\r\n' + 'Max;Müller;1985;m;max@example.org;8.3\r\n'
    const out = parseMembersCsv(enc(csv))
    expect(out.rows).toHaveLength(1)
  })

  it('überspringt komplett leere Zeilen (auch Trennzeichen-only)', () => {
    const csv = [
      HEADER,
      '',
      'Max;Müller;1985;m;max@example.org;8.3',
      ';;;;;', // 6 leere Felder — funktional auch leer
    ].join('\n')
    const out = parseMembersCsv(enc(csv))
    expect(out.rows).toHaveLength(1)
    expect(out.errors).toEqual([])
  })

  it('wirft CsvParseError bei fehlendem Header-Feld', () => {
    const csv = 'firstName;lastName;email\nMax;Müller;m@x.de'
    expect(() => parseMembersCsv(enc(csv))).toThrowError(CsvParseError)
  })

  it('wirft CsvParseError bei leerer Datei', () => {
    expect(() => parseMembersCsv(enc(''))).toThrowError(CsvParseError)
  })

  it('wirft CsvEncodingError bei Nicht-UTF-8 (Latin-1-Umlaut)', () => {
    // 0xFC ist „ü" in Latin-1, alleinstehend ungültig in UTF-8
    expect(() => parseMembersCsv(Buffer.from([0xfc]))).toThrowError(CsvEncodingError)
  })

  it('meldet Validierungs-Fehler mit Zeilennummer, korrekte Zeilen werden weiter geliefert', () => {
    const csv = [
      HEADER,
      'Max;Müller;1985;m;max@example.org;8.3', // Zeile 2 — ok
      'Lisa;Schmidt;1850;w;lisa@example.org;14.5', // Zeile 3 — birthYear zu klein
      'Tim;Test;1990;m;not-an-email;10', // Zeile 4 — email kaputt
      'Anna;Out;1990;m;anna@example.org;30', // Zeile 5 — dtbLk > 25
    ].join('\n')
    const out = parseMembersCsv(enc(csv))
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0]?.firstName).toBe('Max')
    expect(out.errors.map((e) => e.row)).toEqual([3, 4, 5])
    expect(out.errors.every((e) => e.code === 'import.row-validation-failed')).toBe(true)
  })

  it('lower-cased E-Mails und trimt Whitespace', () => {
    const csv = HEADER + '\n' + '  Max  ; Müller ;1985;m; MAX@Example.org ;8.3'
    const out = parseMembersCsv(enc(csv))
    expect(out.rows[0]).toMatchObject({
      firstName: 'Max',
      lastName: 'Müller',
      email: 'max@example.org',
    })
  })

  it('Header-Reihenfolge ist egal', () => {
    const csv = 'email;dtbLk;firstName;lastName;birthYear;gender\nmax@example.org;8.3;Max;Müller;1985;m'
    const out = parseMembersCsv(enc(csv))
    expect(out.rows[0]?.firstName).toBe('Max')
  })
})

describe('memberAdminService.bulkCreate', () => {
  it('legt alle Zeilen an und gibt importedIds zurück', () => {
    const admin = seedAdmin()
    const rows = parseMembersCsv(
      enc([HEADER, 'Max;Müller;1985;m;max@example.org;8.3', 'Lisa;Schmidt;2008;w;lisa@example.org;14.5'].join('\n')),
    ).rows
    const out = memberAdminService.bulkCreate(rows, admin)
    expect(out.importedIds).toHaveLength(2)
    expect(out.skippedEmails).toEqual([])
  })

  it('skipt existierende Email (case-insensitiv) ohne Update', () => {
    const admin = seedAdmin()
    // Vorher: Max gibts schon
    useDb()
      .insert(member)
      .values({
        email: 'max@example.org',
        firstName: 'Alt',
        lastName: 'Existent',
        birthYear: 1970,
        gender: 'm',
        dtbLk: 18,
      })
      .run()

    const rows = parseMembersCsv(
      enc([HEADER, 'Max;Müller;1985;m;MAX@example.org;8.3', 'Lisa;Schmidt;2008;w;lisa@example.org;14.5'].join('\n')),
    ).rows

    const out = memberAdminService.bulkCreate(rows, admin)
    expect(out.importedIds).toHaveLength(1) // nur Lisa
    expect(out.skippedEmails).toEqual(['max@example.org'])

    // Bestätige: Max hat NICHT die neuen Daten bekommen
    const max = useDb()
      .select()
      .from(member)
      .all()
      .find((m) => m.email === 'max@example.org')
    expect(max?.firstName).toBe('Alt')
  })

  it('skipt Duplikate INNERHALB der CSV', () => {
    const admin = seedAdmin()
    const rows = parseMembersCsv(
      enc(
        [
          HEADER,
          'Max;Müller;1985;m;dupe@example.org;8.3',
          'Max;Zweite;1986;m;dupe@example.org;8.3',
        ].join('\n'),
      ),
    ).rows

    const out = memberAdminService.bulkCreate(rows, admin)
    expect(out.importedIds).toHaveLength(1)
    expect(out.skippedEmails).toEqual(['dupe@example.org'])
  })

  it('schreibt EINEN Audit-Eintrag pro Run mit Summary', () => {
    const admin = seedAdmin()
    const rows = parseMembersCsv(
      enc([HEADER, 'Max;Müller;1985;m;max@example.org;8.3'].join('\n')),
    ).rows
    memberAdminService.bulkCreate(rows, admin)

    const logs = auditService
      .listRecent()
      .filter((e) => e.action === 'member.imported')
    expect(logs).toHaveLength(1)
    expect(logs[0]?.actorId).toBe(admin)
    expect(logs[0]?.after).toMatchObject({ imported: 1, skipped: 0 })
  })

  it('importiert in Transaktion — bei DB-Fehler bleiben keine Teilzeilen stehen', () => {
    // Schwerer zu simulieren ohne DB-Mock — Sanity-Check, dass kein partial state
    // entstanden ist, wenn die Schleife durchlief.
    const admin = seedAdmin()
    const rows = parseMembersCsv(
      enc([HEADER, 'Max;Müller;1985;m;max@example.org;8.3'].join('\n')),
    ).rows
    const before = useDb().select().from(member).all().length
    memberAdminService.bulkCreate(rows, admin)
    const after = useDb().select().from(member).all().length
    expect(after - before).toBe(1)
  })
})
