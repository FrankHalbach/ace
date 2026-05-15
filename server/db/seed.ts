/**
 * Seed-Skript für die lokale Entwicklung.
 *
 * Legt drei Test-Logins (Anna, Max, Lisa) und neun weitere Demo-Mitglieder
 * an, dazu eine aktive Saison "Sommer 2026" mit drei Altersgruppen, sodass
 * die Ranglisten direkt befüllt sind und im UI etwas zu klicken ist.
 *
 * Idempotent: bestehende Mitglieder (per Email) und die Demo-Saison
 * (per Name) werden übersprungen.
 *
 * Ausführen: pnpm db:seed
 */
import { sql } from 'drizzle-orm'
import { useDb } from './index'
import { member, type MemberInsert } from './schema/member'
import { generateForSeason } from '../modules/rankings'
import { seasonsService } from '../modules/seasons'

const DEMO_SEASON_NAME = 'Sommer 2026'

const seedMembers: MemberInsert[] = [
  // Test-Logins (Console-Magic-Link funktioniert mit allen drei)
  { email: 'admin@neureut.de', firstName: 'Anna', lastName: 'Admin', birthYear: 1975, gender: 'w', dtbLk: 12.0, roles: ['admin', 'player'] },
  { email: 'max@neureut.de', firstName: 'Max', lastName: 'Müller', birthYear: 1985, gender: 'm', dtbLk: 8.3, roles: ['player'] },
  { email: 'lisa@neureut.de', firstName: 'Lisa', lastName: 'Schmidt', birthYear: 1990, gender: 'w', dtbLk: 10.5, roles: ['player'] },

  // Aktive Herren (18–49) — fünf für sinnvolle Pyramide
  { email: 'tom@neureut.de', firstName: 'Tom', lastName: 'Weber', birthYear: 1988, gender: 'm', dtbLk: 9.0, roles: ['player'] },
  { email: 'klaus@neureut.de', firstName: 'Klaus', lastName: 'Bauer', birthYear: 1992, gender: 'm', dtbLk: 9.8, roles: ['player'] },
  { email: 'tim@neureut.de', firstName: 'Tim', lastName: 'Fischer', birthYear: 1995, gender: 'm', dtbLk: 10.2, roles: ['player'] },
  { email: 'jan@neureut.de', firstName: 'Jan', lastName: 'Hoffmann', birthYear: 1980, gender: 'm', dtbLk: 11.5, roles: ['player'] },

  // Aktive Damen (18–49)
  { email: 'sara@neureut.de', firstName: 'Sara', lastName: 'Becker', birthYear: 1989, gender: 'w', dtbLk: 11.0, roles: ['player'] },
  { email: 'mia@neureut.de', firstName: 'Mia', lastName: 'Schulz', birthYear: 1993, gender: 'w', dtbLk: 12.5, roles: ['player'] },

  // Über 50
  { email: 'heinz@neureut.de', firstName: 'Heinz', lastName: 'Wagner', birthYear: 1965, gender: 'm', dtbLk: 13.5, roles: ['player'] },

  // U18
  { email: 'lukas@neureut.de', firstName: 'Lukas', lastName: 'Klein', birthYear: 2010, gender: 'm', dtbLk: 15.0, roles: ['player'] },
  { email: 'emma@neureut.de', firstName: 'Emma', lastName: 'Wolf', birthYear: 2009, gender: 'w', dtbLk: 16.0, roles: ['player'] },
]

export function runSeed(): void {
  const db = useDb()

  let inserted = 0
  let skipped = 0
  for (const m of seedMembers) {
    const existing = db
      .select()
      .from(member)
      .where(sql`lower(${member.email}) = ${m.email.toLowerCase()}`)
      .get()
    if (existing) {
      skipped++
      continue
    }
    db.insert(member).values(m).run()
    inserted++
  }

  const existingSeasons = seasonsService.list()
  const demoSeasonExists = existingSeasons.some((s) => s.name === DEMO_SEASON_NAME)

  if (demoSeasonExists) {
    console.log(`✔ Seed komplett: ${inserted} Mitglieder neu, ${skipped} übersprungen.`)
    console.log(`  Saison "${DEMO_SEASON_NAME}" existiert bereits — übersprungen.`)
  } else {
    const season = seasonsService.create({ name: DEMO_SEASON_NAME })
    seasonsService.addAgeGroup(season.id, {
      name: 'Aktive',
      minAge: 18,
      maxAge: 49,
      genderRule: 'separate',
      active: true,
    })
    seasonsService.addAgeGroup(season.id, {
      name: 'Über 50',
      minAge: 50,
      maxAge: null,
      genderRule: 'separate',
      active: true,
    })
    seasonsService.addAgeGroup(season.id, {
      name: 'U18',
      minAge: 14,
      maxAge: 17,
      genderRule: 'separate',
      active: true,
    })
    seasonsService.start(season.id)
    const { rankingsCreated, entriesCreated } = generateForSeason(season.id)

    console.log(`✔ Seed komplett: ${inserted} Mitglieder neu, ${skipped} übersprungen.`)
    console.log(`  Saison "${DEMO_SEASON_NAME}" angelegt: ${rankingsCreated} Ranglisten, ${entriesCreated} Einträge.`)
  }

  console.log('  Test-Logins:')
  for (const m of seedMembers.slice(0, 3)) {
    console.log(`    - ${m.email}  (${m.firstName} ${m.lastName}, ${m.roles?.join('/')})`)
  }
}

if (import.meta.main || process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  runSeed()
}
