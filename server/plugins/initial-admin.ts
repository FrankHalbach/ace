import { sql } from 'drizzle-orm'
import { useDb } from '../db'
import { member, type Role } from '../db/schema'

/**
 * Beim Server-Start: legt einen Initial-Admin in der DB an, wenn die
 * Env-Var INITIAL_ADMIN_EMAIL gesetzt ist und noch kein Member mit dieser
 * Email existiert.
 *
 * Idempotent — bei laufender Demo-Instanz oder produktiver DB tut der
 * Plugin nichts, weil der Match-Check trifft.
 *
 * Gedacht primär für Azure-Container-Apps-Deployments mit ephemerem
 * Storage: nach jedem Container-Restart (env-var-Change, Image-Update,
 * Crash-Recovery) ist der Admin automatisch wieder da, ohne manuellen
 * SQL-Insert via `containerapp exec`.
 *
 * Optionale Felder via separate Env-Vars; sonst sinnvolle Defaults.
 */
export default defineNitroPlugin(() => {
  const rawEmail = process.env.INITIAL_ADMIN_EMAIL?.trim()
  if (!rawEmail) return

  const email = rawEmail.toLowerCase()
  const db = useDb()

  const existing = db
    .select({ id: member.id })
    .from(member)
    .where(sql`lower(${member.email}) = ${email}`)
    .get()

  if (existing) return

  const firstName = process.env.INITIAL_ADMIN_FIRST_NAME?.trim() || 'Admin'
  const lastName = process.env.INITIAL_ADMIN_LAST_NAME?.trim() || ''
  const birthYear = Number(process.env.INITIAL_ADMIN_BIRTH_YEAR ?? 1980)
  const gender = (process.env.INITIAL_ADMIN_GENDER?.trim() ?? 'm') as 'm' | 'w'
  const dtbLk = Number(process.env.INITIAL_ADMIN_DTB_LK ?? 25)

  db.insert(member)
    .values({
      email: rawEmail,
      firstName,
      lastName,
      birthYear,
      gender,
      dtbLk,
      status: 'aktiv',
      roles: ['player', 'admin'] satisfies Role[],
    })
    .run()

  console.log(`[initial-admin] '${email}' angelegt (firstName=${firstName}, birthYear=${birthYear}).`)
})
