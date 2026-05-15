/**
 * Setzt die lokale SQLite-Entwicklungs-DB komplett zurück.
 *
 * 1. Löscht `data/ace.db` inkl. WAL-/SHM-Sidecar-Dateien
 * 2. Wendet alle Migrations frisch an
 * 3. Seed-Daten einspielen (drei Test-Logins + Demo-Saison)
 *
 * ACHTUNG: Bei laufendem Dev-Server (`pnpm dev`) hat Better-SQLite3 die
 * Datei offen — auf Windows schlägt das Löschen dann fehl. In dem Fall
 * den Dev-Server vorher beenden.
 *
 * Ausführen: pnpm db:reset
 */
import { existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { _resetDbForTests } from './index'
import { runMigrations } from './migrate'
import { runSeed } from './seed'

const dbPath = resolve(process.env.NUXT_DB_PATH ?? './data/ace.db')
const sidecars = [dbPath, `${dbPath}-shm`, `${dbPath}-wal`, `${dbPath}-journal`]

console.log(`▸ DB-Reset für ${dbPath}`)
console.log(`  Verzeichnis: ${dirname(dbPath)}`)

_resetDbForTests()

for (const path of sidecars) {
  if (!existsSync(path)) continue
  try {
    rmSync(path, { force: true })
    console.log(`  gelöscht: ${path}`)
  } catch (err) {
    console.error(`  konnte ${path} nicht löschen — Dev-Server noch offen?`)
    throw err
  }
}

runMigrations()
console.log('✔ Migrations angewendet')

runSeed()
console.log('✔ DB-Reset fertig.')
