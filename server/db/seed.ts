/**
 * Seed-Skript für die lokale Entwicklung.
 *
 * Erzeugt drei Test-Member. Idempotent: wenn ein Member mit derselben Email
 * schon existiert, wird er übersprungen.
 *
 * Ausführen: pnpm db:seed
 */
import { useDb } from './index'
import { member, type MemberInsert } from './schema/member'
import { sql } from 'drizzle-orm'

const seeds: MemberInsert[] = [
  {
    email: 'max@neureut.de',
    firstName: 'Max',
    lastName: 'Müller',
    birthYear: 1985,
    gender: 'm',
    dtbLk: 8.3,
    roles: ['player'],
  },
  {
    email: 'lisa@neureut.de',
    firstName: 'Lisa',
    lastName: 'Schmidt',
    birthYear: 1990,
    gender: 'w',
    dtbLk: 10.5,
    roles: ['player'],
  },
  {
    email: 'admin@neureut.de',
    firstName: 'Anna',
    lastName: 'Admin',
    birthYear: 1975,
    gender: 'w',
    dtbLk: 12.0,
    roles: ['admin', 'player'],
  },
]

const db = useDb()
let inserted = 0
let skipped = 0

for (const m of seeds) {
  const existing = db.select().from(member).where(sql`lower(${member.email}) = ${m.email.toLowerCase()}`).get()
  if (existing) {
    skipped++
    continue
  }
  db.insert(member).values(m).run()
  inserted++
}

console.log(`✔ Seed komplett: ${inserted} angelegt, ${skipped} übersprungen.`)
console.log('  Test-Logins:')
for (const m of seeds) {
  console.log(`    - ${m.email}  (${m.firstName} ${m.lastName}, ${m.roles?.join('/')})`)
}
