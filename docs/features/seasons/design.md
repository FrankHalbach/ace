# Feature-Design-Doc: `seasons`

**Status**: entwurf
**Datum**: 2026-05-15
**Modul**: [`seasons`](../../architecture/overview.md#1-modul-schnitt)

## Ziel

Admin kann Saisons anlegen, konfigurieren und durch ihren Lifecycle führen.
Jede Saison hat eine Liste von Altersgruppen, die der Admin frei definiert.

Damit existiert die organisatorische Klammer, auf der spätere Features
(Ranglisten, Challenges, Match-Modi) aufbauen.

## Spec-Bezug

| FR-ID  | Kurzbeschreibung                                       | Abgedeckt durch                                    |
|--------|--------------------------------------------------------|----------------------------------------------------|
| FR-2d  | Senioren-Klassen unterstützt                           | Admin kann beliebige Altersgruppen anlegen         |
| FR-2j  | Admin definiert Altersgruppen pro Saison frei          | `AgeGroup`-Tabelle + Admin-API                     |
| FR-15c | Nach Saison-Start sind Regeln eingefroren              | `PATCH` nur im Status `PLANNED` erlaubt            |
| FR-15b | Historie aller Saisons bleibt einsehbar                | `GET /api/seasons` liefert alle, inkl. ARCHIVED    |
| FR-61  | Saison-Verwaltung: Anlegen, Konfig, Starten, Schließen | API + Frontend                                     |
| FR-64  | Konfiguration aller Challenge-Regeln pro Saison        | `Season.config` als JSON, *Werte* in `challenges`  |

**Nicht abgedeckt** (verschoben):

- FR-15, FR-15a (Saison-Übergangs-Strategien) → `rankings`-Feature, weil
  dort die End-Reihenfolge der Vorgängersaison gebraucht wird
- FR-2e, FR-2f (automatische Aufnahme in Senioren/Aktive) → `rankings`
- Eigentliche Challenge-Regelwerk-Werte (Pyramide-Sprungweite, Cooldown etc.)
  → `challenges`-Feature setzt Defaults und liest aus `Season.config`
- Auswahl des Wertungs-Modus pro Rangliste (N-01) → `rankings`-Feature

## Datenmodell

### `Season` ([`server/db/schema/season.ts`](../../../server/db/schema/season.ts))

```typescript
export const season = sqliteTable('season', {
  id: integer('id').primaryKey({ autoIncrement: true }).$type<SeasonId>(),
  name: text('name').notNull(),                              // z. B. "Sommer 2026"
  status: text('status', {
    enum: ['PLANNED', 'ACTIVE', 'CLOSED', 'ARCHIVED'],
  }).notNull().default('PLANNED'),
  startedAt: integer('started_at', { mode: 'timestamp' }),   // bei Status ACTIVE gesetzt
  closedAt: integer('closed_at', { mode: 'timestamp' }),     // bei Status CLOSED gesetzt
  archivedAt: integer('archived_at', { mode: 'timestamp' }), // bei Status ARCHIVED gesetzt
  config: text('config', { mode: 'json' }).$type<SeasonConfig>().notNull().default({}),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull().default(sql`(unixepoch())`),
}, (t) => [uniqueIndex('season_name_idx').on(t.name)])
```

`SeasonConfig` als TS-Type, in diesem Feature leerer Container — wird vom
`challenges`-Feature mit konkreten Feldern (Annahmefrist, Cooldown, etc.)
gefüllt.

### `AgeGroup` ([`server/db/schema/age-group.ts`](../../../server/db/schema/age-group.ts))

```typescript
export const ageGroup = sqliteTable('age_group', {
  id: integer('id').primaryKey({ autoIncrement: true }).$type<AgeGroupId>(),
  seasonId: integer('season_id').notNull()
    .references(() => season.id, { onDelete: 'cascade' }).$type<SeasonId>(),
  name: text('name').notNull(),                              // "U18", "Aktive", "Herren 40"
  minAge: integer('min_age'),                                // null = keine Untergrenze
  maxAge: integer('max_age'),                                // null = keine Obergrenze
  genderRule: text('gender_rule', {
    enum: ['mixed', 'separate', 'both'],
  }).notNull(),
  // mixed:    nur Offene Rangliste (Spec FR-10b — Jugend ohne Herren/Damen-Split)
  // separate: nur Herren + Damen (Spec FR-10 ohne Offene — selten, aber möglich)
  // both:     Herren + Damen + Offen (Spec FR-10 für Erwachsene, Default)
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
}, (t) => [
  uniqueIndex('age_group_season_name_idx').on(t.seasonId, t.name),
])
```

### Migrations

Eine neue Migration `0001_seasons.sql` via `pnpm db:generate`.

## Lifecycle und Constraints

```
PLANNED ──start──► ACTIVE ──close──► CLOSED ──archive──► ARCHIVED
   │                  │
   └─ edit/delete OK  └─ keine Edits mehr (FR-15c)
```

**Constraints**:

- Transitionen sind **nur vorwärts** — keine Rückkehr (FR-15c-Geist)
- `PATCH /api/seasons/:id` erlaubt nur im Status `PLANNED`
- `DELETE /api/seasons/:id` erlaubt nur im Status `PLANNED`
- `AgeGroup`-Änderungen nur, solange die Saison `PLANNED` ist
- **Parallele aktive Saisons sind erlaubt** (Spec § 4.3 erwähnt Sommer und
  Winter — können sich am Jahresende überlappen). Konsistenz-Regeln dafür
  kommen mit `rankings`.
- Sechs Senioren-Klassen (H40, H50, H60, D40, D50) müssen NICHT zwingend
  angelegt werden — Admin entscheidet pro Saison

## API-Endpoints

| Methode | Pfad                                    | Auth          | Zweck                                       |
|---------|-----------------------------------------|---------------|---------------------------------------------|
| `GET`   | `/api/seasons`                          | session       | Saison-Liste (alle Status sichtbar)         |
| `GET`   | `/api/seasons/:id`                      | session       | Saison-Detail inkl. `ageGroups[]`           |
| `POST`  | `/api/seasons`                          | admin         | Neue Saison im Status `PLANNED` anlegen     |
| `PATCH` | `/api/seasons/:id`                      | admin         | Name/config ändern (nur `PLANNED`)          |
| `DELETE`| `/api/seasons/:id`                      | admin         | Löschen (nur `PLANNED`, cascadet AgeGroups) |
| `POST`  | `/api/seasons/:id/start`                | admin         | `PLANNED` → `ACTIVE`                        |
| `POST`  | `/api/seasons/:id/close`                | admin         | `ACTIVE` → `CLOSED`                         |
| `POST`  | `/api/seasons/:id/archive`              | admin         | `CLOSED` → `ARCHIVED`                       |
| `POST`  | `/api/seasons/:id/age-groups`           | admin         | Altersgruppe anlegen (nur `PLANNED`)        |
| `PATCH` | `/api/age-groups/:id`                   | admin         | Altersgruppe ändern (nur `PLANNED`)         |
| `DELETE`| `/api/age-groups/:id`                   | admin         | Altersgruppe löschen (nur `PLANNED`)        |

### Zod-Schemas

```typescript
export const createSeasonInput = z.object({
  name: z.string().min(3).max(80),
})

export const updateSeasonInput = z.object({
  name: z.string().min(3).max(80),
  config: z.record(z.string(), z.unknown()).optional(),
}).partial().strict()

export const createAgeGroupInput = z.object({
  name: z.string().min(1).max(40),
  minAge: z.number().int().min(0).max(120).nullable(),
  maxAge: z.number().int().min(0).max(120).nullable(),
  genderRule: z.enum(['mixed', 'separate', 'both']),
  active: z.boolean().default(true),
}).refine(
  (v) => v.minAge === null || v.maxAge === null || v.minAge <= v.maxAge,
  { message: 'minAge muss ≤ maxAge sein', path: ['minAge'] },
)
```

### Fehler-Codes

| Code                          | HTTP | Bedeutung                                                  |
|-------------------------------|------|------------------------------------------------------------|
| `season.not-found`            | 404  | Unbekannte Season-ID                                       |
| `season.invalid-transition`   | 409  | Lifecycle-Transition nicht erlaubt (z. B. CLOSED → ACTIVE) |
| `season.frozen`               | 409  | Änderung versucht, aber Status ist nicht `PLANNED`         |
| `season.name-taken`           | 409  | Saison-Name bereits vergeben                               |
| `age-group.not-found`         | 404  | Unbekannte AgeGroup-ID                                     |
| `age-group.name-taken`        | 409  | AgeGroup-Name in der Saison bereits vergeben               |
| `auth.role-required`          | 403  | Aufrufer hat nicht die Rolle `admin`                       |

## Role-Check (neu)

Wir brauchen erstmals einen Server-seitigen `requireRole`-Helfer:

```typescript
// server/shared/require-role.ts
export function requireRole(event: H3Event, role: Role): void {
  const session = ... // requireUserSession
  if (!session.user.roles.includes(role)) {
    throw createError({ statusCode: 403, statusMessage: 'auth.role-required' })
  }
}
```

In Admin-Handlern: `requireRole(event, 'admin')` direkt nach `requireUserSession`.

## Cross-Modul-Aufrufe

| Aufrufer          | Aufgerufen   | Service-Funktion                            | Zweck                              |
|-------------------|--------------|---------------------------------------------|------------------------------------|
| (später) rankings | `seasons`    | `findActiveSeasons()`, `findById()`         | Saison-Kontext für Rangliste       |
| (später) challenges | `seasons`  | `getSeasonConfig(id)`                       | Challenge-Regeln aus Config        |
| (später) admin    | `seasons`    | alle Service-Funktionen                     | Admin-Audit-Wrapper                |

In diesem Feature ruft `seasons` selbst kein anderes Modul auf — es ist
blattseitig.

## UI-Skizze

### `/admin` — Admin-Landing

```
┌─────────────────────────────────────────────────────┐
│  Admin                                              │
│                                                     │
│  Hier verwaltest du Saisons, Mitglieder und         │
│  Plattform-Konfiguration.                           │
│                                                     │
│  [ Saisons & Altersgruppen ──────► /admin/seasons ] │
│  [ Mitglieder         (folgt mit admin-Feature)   ] │
│  [ Audit-Log          (folgt mit admin-Feature)   ] │
└─────────────────────────────────────────────────────┘
```

### `/admin/seasons` — Liste

```
┌─────────────────────────────────────────────────────┐
│  Saisons                       [ + Neue Saison ]    │
│                                                     │
│  Sommer 2026          [Aktiv]    seit 15.05.2026    │
│    8 Altersgruppen                                  │
│                                                     │
│  Winter 2025          [Geschlossen]                 │
│    6 Altersgruppen                                  │
│                                                     │
│  Winter 2024          [Archiviert]                  │
│    6 Altersgruppen                                  │
└─────────────────────────────────────────────────────┘
```

### `/admin/seasons/[id]` — Detail + Edit

```
┌─────────────────────────────────────────────────────┐
│  Sommer 2026                  [Geplant]             │
│                                                     │
│  Name [ Sommer 2026                            ]    │
│  [ Speichern ]                                      │
│                                                     │
│  Altersgruppen                  [ + Hinzufügen ]    │
│  ─────────────────────────────────────────────────  │
│  U12         0–11    mixed       aktiv     [⋮]      │
│  U15         12–14   mixed       aktiv     [⋮]      │
│  U18         15–17   separate    aktiv     [⋮]      │
│  Aktive      18+     both        aktiv     [⋮]      │
│  Herren 40   40+     separate    aktiv     [⋮]      │
│                                                     │
│  Lifecycle                                          │
│  [ Saison starten → ACTIVE ]                        │
└─────────────────────────────────────────────────────┘
```

Im Status `ACTIVE` werden die Edit-Felder zu Read-Only, der Lifecycle-Button
wechselt zu „Saison schließen". Analog `CLOSED` → „Archivieren".

### Nicht-Admin-Sicht

Eingeloggte Nicht-Admins sehen Saisons nur dort, wo sie organisatorisch
relevant sind — z. B. später im Rangliste-Header. Eine eigene Seite gibt's
in diesem Feature noch nicht.

## Validierung und Edge-Cases

- **Name-Eindeutigkeit**: case-sensitive eindeutig pro Datenbank (UI-Hinweis,
  damit es kein „Sommer 2026" und „sommer 2026" gibt — UI lowercased für
  Lookup, DB-Index normiert nicht; einfacher zu lesen in Logs)
- **AgeGroup ohne Altersgrenzen**: `minAge = null, maxAge = null` = jedes
  Alter erlaubt (für „Aktive" als Catchall)
- **Saison mit 0 AgeGroups starten?** → erlaubt, aber unsinnig. UI warnt
  („Diese Saison hat keine Altersgruppen — willst du wirklich starten?").
  Backend lässt es trotzdem zu — Datenkonsistenz reicht
- **DELETE Season mit AgeGroups**: cascadet automatisch via FK
- **Race-Condition Status-Transition**: bei parallelen Requests kann nur einer
  die Transition vollziehen — wir nutzen `UPDATE … WHERE status = 'PLANNED'`,
  prüfen `changes === 1`

## Hintergrund-Jobs

Keine in diesem Feature.

## Tests

- **Unit (Service)**: Lifecycle-Transitionen erlaubt/verboten, AgeGroup-CRUD
  blockiert nach Saison-Start, Validierung minAge ≤ maxAge
- **Integration**: API-Endpoints mit Admin- vs Player-Session, Status-Filter

## Frontend-Komponenten (neu)

- `SeasonStatusBadge.vue` — Pill mit Token-Farbe aus design-system
  - `PLANNED` → neutral
  - `ACTIVE` → primary
  - `CLOSED` → secondary
  - `ARCHIVED` → muted
- `AgeGroupRow.vue` — Eine Zeile mit Edit-/Delete-Menü
- Layout `layouts/admin.vue` — minimaler Wrapper mit Title-Bar

## Out of Scope für diesen Schritt

Bewusst NICHT enthalten:

- Saison-Klon-Funktion („Kopiere Altersgruppen aus Sommer 2025") — v2
- Automatische Saison-Anlage (Cron schlägt Sommer/Winter vor) — v2
- Ranglisten innerhalb der Saison (eigenes Feature `rankings`)
- Match-Modi und Challenge-Regelwerk (eigenes Feature `challenges`)
- Saison-Übergangs-Logik (FR-15) — kommt mit `rankings`
- Mannschafts-Tags (FR-2g–i) — werden separat im Member-Profil verwaltet

## Geklärte Punkte

Keine offenen Fragen. Standardannahmen:

- AgeGroup ohne `min/maxAge` = Catchall (für „Aktive")
- Mehrere aktive Saisons parallel erlaubt (Sommer + Winter Überlapp)
- Status-Transitionen nur vorwärts, Bypass nur via DB-Eingriff (Admin-Audit
  per separater Aktion in `admin`-Feature)
