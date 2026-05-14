# 002 – Datenbank: SQLite mit Drizzle ORM

**Status**: akzeptiert
**Datum**: 2026-05-11
**Entscheider**: Frank

## Kontext

Wahl der Datenbank für die Tennis-Plattform.
Constraints:

- ~500 Mitglieder, unter 100 gleichzeitig aktiv
- ~15 Entities mit moderaten Beziehungen
- Etwa 1.000–10.000 Matches pro Saison erwartet
- Lokale Entwicklung soll mit minimalem Setup-Aufwand starten
- Backup soll einfach sein
- Kostenlose oder sehr günstige Hosting-Option

## Entscheidung

**SQLite** als Datenbank für lokale Entwicklung und Produktion.
**Drizzle ORM** als typsicheres ORM mit Migrations-Tooling.

## Konsequenzen

### Positiv
- Keine separate DB-Installation nötig — SQLite ist eine Datei
- Lokale Entwicklung ohne Docker oder zusätzliche Prozesse
- Backups sind File-Copies, trivial automatisierbar
- Drizzle ist typsicher und schema-first
- Bei späterem Bedarf ist Migration zu Postgres mit Drizzle ein Konfigurations-Switch
- Performance ist für die Größenordnung mehr als ausreichend

### Negativ
- Keine echte Concurrent-Write-Performance (eine Write-Verbindung gleichzeitig)
- Bei späterem Wachstum (z. B. mehrere Vereine auf einer Instanz) wäre Migration zu Postgres nötig
- Manche Postgres-Features (volltextsuche, JSON-Operationen) sind in SQLite eingeschränkt

### Neutral
- WAL-Modus (`journal_mode=WAL`) und `foreign_keys=ON` müssen explizit aktiviert werden
- Backups via `VACUUM INTO` oder `litestream` (für kontinuierliche Replikation)

## Alternativen

### Alternative A: PostgreSQL auf Hetzner
- Mehr Features, robuster bei parallelen Writes
- Mehr Setup-Aufwand (Docker, Backup-Konfiguration, Verbindungs-Pooling)
- Für die Größenordnung der Anwendung überdimensioniert

### Alternative B: Cloudflare D1 (managed SQLite)
- Kostenlos, gut integrierbar
- ABER: nicht so flexibel für Cron-Jobs und Long-Running-Tasks
- Lock-in an Cloudflare-Ökosystem
- Backup und Datenexport eingeschränkter
- Erwogen für später bei Bedarf

### Alternative C: Supabase Postgres
- Free Tier vorhanden, aber pausiert nach 1 Woche Inaktivität
- Bei saisonal schwankender Nutzung problematisch

## Referenzen

- ADR-001 (Tech-Stack)
- Drizzle ORM: https://orm.drizzle.team
- SQLite-Performance-Limits: https://sqlite.org/whentouse.html
