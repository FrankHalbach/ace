import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useDb } from '../../server/db'
import { member } from '../../server/db/schema/member'
import { createTestDb } from '../helpers/test-db'

const t = createTestDb()
beforeAll(() => t.open())
afterAll(() => t.cleanup())
beforeEach(() => t.reset())

// Verifies the 0014_member_preferences_rename migration's SQL transformation
// (re-applied here on legacy-shaped rows we insert manually, since the test
// harness always runs the migration during setup).
const renameSql = readFileSync(
  resolve(process.cwd(), 'server/db/migrations/0014_member_preferences_rename.sql'),
  'utf8',
)

function applyRename() {
  useDb().run(sql.raw(renameSql))
}

function insertLegacyMember(email: string, seniorsFriendly: boolean) {
  // Insert via raw SQL so we can put the deprecated `seniorsFriendly` key
  // into the JSON without the schema type fighting us.
  useDb().run(sql`
    INSERT INTO member (id, email, first_name, last_name, birth_year, gender, preferences)
    VALUES (
      lower(hex(randomblob(8))),
      ${email},
      'Old',
      'Schema',
      1990,
      'm',
      json_object(
        'singlesChallenges', json('true'),
        'singlesFriendly', json('true'),
        'doublesFriendly', json('false'),
        'mixedFriendly', json('false'),
        'seniorsFriendly', json(${seniorsFriendly ? 'true' : 'false'})
      )
    )
  `)
}

function readPreferences(email: string): Record<string, boolean> {
  const row = useDb().select().from(member).where(sql`email = ${email}`).get()
  return row!.preferences as unknown as Record<string, boolean>
}

describe('0014_member_preferences_rename', () => {
  it('renames seniorsFriendly to ageGroupFriendly preserving the value', () => {
    insertLegacyMember('legacy-true@example.com', true)
    insertLegacyMember('legacy-false@example.com', false)

    applyRename()

    const truthy = readPreferences('legacy-true@example.com')
    expect(truthy.ageGroupFriendly).toBe(true)
    expect('seniorsFriendly' in truthy).toBe(false)

    const falsy = readPreferences('legacy-false@example.com')
    expect(falsy.ageGroupFriendly).toBe(false)
    expect('seniorsFriendly' in falsy).toBe(false)
  })

  it('is idempotent — re-running leaves already-migrated rows untouched', () => {
    insertLegacyMember('idem@example.com', true)
    applyRename()
    const first = readPreferences('idem@example.com')
    applyRename()
    const second = readPreferences('idem@example.com')
    expect(second).toEqual(first)
  })

  it('does not touch rows that already use ageGroupFriendly', () => {
    useDb()
      .insert(member)
      .values({
        email: 'modern@example.com',
        firstName: 'Modern',
        lastName: 'Schema',
        birthYear: 1990,
        gender: 'm',
      })
      .run()

    const before = readPreferences('modern@example.com')
    applyRename()
    const after = readPreferences('modern@example.com')
    expect(after).toEqual(before)
    expect(after.ageGroupFriendly).toBe(false)
    expect('seniorsFriendly' in after).toBe(false)
  })
})
