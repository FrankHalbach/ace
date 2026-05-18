# Feature-Design-Doc: `admin`

**Status**: entwurf
**Datum**: 2026-05-17
**Modul**: [`admin`](../../architecture/overview.md#1-modul-schnitt) (neu)

## Ziel

Der Admin-Bereich wird auf das gebracht, was vor dem Mitglieder-Launch fehlt:
Mitglieder anlegen und einladen, Rollen vergeben, Mannschafts-Tags pflegen,
Ergebnisse oder LK manuell korrigieren — und jeder dieser Eingriffe wird in
einem Audit-Log nachvollziehbar. Saisons und Altersgruppen sind bereits
implementiert und bleiben unverändert.

## Spec-Bezug

| FR-ID  | Kurzbeschreibung                                              | Abgedeckt durch                                      |
|--------|---------------------------------------------------------------|------------------------------------------------------|
| FR-60  | Mitgliederverwaltung mit CSV-Initialimport                    | `POST /api/admin/members/import` + `/admin/members/import` |
| FR-60a | Einladungslinks für neue Mitglieder (Self-Service-Profil)     | `POST /api/admin/members/:id/invite` + Bulk-Action        |
| FR-60b | Austritt: Soft-Delete                                         | `POST /api/admin/members/:id/deactivate` → `status='pausiert'` mit Grund `austritt` |
| FR-62  | Rollen-Zuweisung (Spieler, Trainer, Admin, mehrfach)          | `PATCH /api/admin/members/:id/roles` + Editor in `/admin/members` |
| FR-2g  | Spieler mit Mannschafts-Tags markierbar                       | `member_team_tag`-Junction + Tag-Editor pro Mitglied        |
| FR-2h  | Mannschafts-Tags sind reine Anzeige (keine Logik)             | Keine Auswirkung auf Rangliste/Vorschläge/Challenges        |
| FR-2i  | Pflege Mannschafts-Tags durch Admin **oder** Trainer          | Endpoints `auth: admin\|trainer`, gemeinsame UI unter `/team-tags`, UserMenu-Eintrag bei beiden Rollen |
| FR-63  | Manuelle Korrektur Ergebnisse/Rangliste + Audit-Log           | `auditEntry`-Tabelle, `PATCH /api/admin/results/:id`, `PATCH /api/admin/members/:id/lk`, `GET /api/admin/audit-log` |
| NFR-6  | Audit-Log für administrative Eingriffe                        | siehe FR-63                                                 |
| Spec §4.1 Rollentabelle (Z. 650) | LK-Korrektur durch Trainer/Admin mit Audit | `PATCH /api/admin/members/:id/lk`                         |

**Nicht abgedeckt** (bewusst auf später vertagt):

- **FR-64** (Challenge-Regeln pro Saison konfigurieren) — vor-Launch
  vereinfacht (Issue #57): kein Saison-Config-Feld in der UI editierbar,
  nur ein Match-Modus aktiv. Weitere Limits, Cooldowns und Modi bleiben
  hardcoded. Eingriff über Code-Deploy ausreichend für v1.
- **FR-117** (alle Limits admin-konfigurierbar) — siehe FR-64, gleiche
  Begründung.
- **FR-121** (KPI-Auswahl konfigurieren) — wird zusammen mit dem UI-Redesign
  geplant.
- **Endgültige DSGVO-Löschung nach Aufbewahrungsfrist** (Teil von FR-60b) —
  manueller SQL-Eingriff für v1 ausreichend, dokumentiert in
  `docs/operations/dsgvo.md` (folgt separat).
- **Moderations-Sicht für Blockierungen** (Spec §6 Z. 1312) — Blockierungen
  selbst sind in v1 noch nicht modelliert.

## Datenmodell

### Neue Tabelle: `audit_entry`

```typescript
// server/db/schema/audit-entry.ts
export type AuditEntryId = Brand<string, 'AuditEntryId'>
export type AuditAction =
  | 'member.role-changed'
  | 'member.deactivated'
  | 'member.reactivated'
  | 'member.lk-corrected'
  | 'member.invited'
  | 'member.imported'
  | 'member.team-tags-changed'
  | 'team-tag.created'
  | 'team-tag.renamed'
  | 'team-tag.deleted'
  | 'result.corrected'
  | 'result.dispute-decided'   // Trainer-Entscheidung (vom trainer-Modul geschrieben)
  | 'challenge.cancelled-by-trainer'
  | 'friendly.cancelled-by-trainer'

export const auditEntry = sqliteTable('audit_entry', {
  id: text('id').primaryKey().$type<AuditEntryId>().$defaultFn(() => newPublicId() as AuditEntryId),
  actorId: text('actor_id').notNull().references(() => member.id).$type<MemberId>(),
  action: text('action').$type<AuditAction>().notNull(),
  subjectId: text('subject_id'),     // freie Referenz (memberId, challengeId, ...)
  subjectKind: text('subject_kind'), // 'member' | 'challenge' | 'friendly' | 'result'
  before: text('before', { mode: 'json' }).$type<unknown>(),
  after: text('after', { mode: 'json' }).$type<unknown>(),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
}, (t) => [
  index('audit_entry_subject_idx').on(t.subjectKind, t.subjectId),
  index('audit_entry_created_idx').on(t.createdAt),
])
```

`before`/`after` als freies JSON, weil die Aktionen sehr heterogen sind. Das
Schema bleibt schmal und lässt sich später ohne Migration erweitern, wenn
neue Aktionen dazukommen.

### Schema-Erweiterung: `member`

```typescript
// neu in server/db/schema/member.ts
deactivatedAt: integer('deactivated_at', { mode: 'timestamp' }),
deactivationReason: text('deactivation_reason'),  // freitext, z.B. "Austritt 2026-Q2"
invitedAt: integer('invited_at', { mode: 'timestamp' }),
invitedBy: text('invited_by').references(() => member.id).$type<MemberId>(),
firstLoginAt: integer('first_login_at', { mode: 'timestamp' }),
```

`status: 'pausiert'` bleibt der primäre Filter — `deactivatedAt` ist der
Marker, der `pausiert` von einer Selbst-Pausierung (z. B. Verletzung)
unterscheidet. Das ist wichtig, weil:

- **Self-Pause** (FR-aus Profil-Feature): Spieler pausiert sich selbst →
  `status='pausiert'`, `deactivatedAt=null`.
- **Admin-Deaktivierung** (FR-60b): `status='pausiert'`,
  `deactivatedAt=<timestamp>`, `deactivationReason` gesetzt.

Beim Re-Aktivieren werden `deactivatedAt`, `deactivationReason` zurück auf
null gesetzt, und ein Audit-Eintrag `member.reactivated` geschrieben.

`firstLoginAt` wird beim ersten erfolgreichen Login (Konsum eines
Magic-Link-Tokens) gesetzt, wenn das Feld noch null ist. Das erlaubt der
Mitgliederliste, `pendend` (eingeladen, aber noch nie eingeloggt) günstig
zu rendern — ohne Join auf `magic_link_token`.

### Neue Tabellen: `team_tag` und `member_team_tag`

```typescript
// server/db/schema/team-tag.ts
export type TeamTagId = Brand<string, 'TeamTagId'>

export const teamTag = sqliteTable('team_tag', {
  id: text('id').primaryKey().$type<TeamTagId>().$defaultFn(() => newPublicId() as TeamTagId),
  name: text('name').notNull(),                  // z.B. "1. Herren", "Damen 30"
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
}, (t) => [uniqueIndex('team_tag_name_lower_idx').on(sql`lower(${t.name})`)])

// server/db/schema/member-team-tag.ts
export const memberTeamTag = sqliteTable('member_team_tag', {
  memberId: text('member_id').notNull().references(() => member.id, { onDelete: 'cascade' }).$type<MemberId>(),
  teamTagId: text('team_tag_id').notNull().references(() => teamTag.id, { onDelete: 'cascade' }).$type<TeamTagId>(),
  assignedAt: integer('assigned_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  assignedBy: text('assigned_by').references(() => member.id).$type<MemberId>(),
}, (t) => [primaryKey({ columns: [t.memberId, t.teamTagId] })])
```

Begründung Tabellen statt JSON-Array am Member: zentrale Pflege der
Mannschaftsnamen, damit Tippfehler („1.Herren" vs „1. Herren") nicht zu
zerfallenen Tags führen. Außerdem kann eine Mannschaft umbenannt werden,
ohne alle Mitglieder anzufassen, und das `active`-Flag erlaubt, alte
Mannschaften zu archivieren, ohne historische Zuordnungen zu verlieren.

Keine Logik hängt an Tags (FR-2h) — sie sind ein reiner Anzeige-Layer.

### Wiederverwendung: `magicLinkToken` für Einladungen

Die bestehende [`magicLinkToken`-Tabelle](../../../server/db/schema/magic-link-token.ts)
deckt Einladungslinks ab — keine neue Tabelle nötig. Unterschied:

- **Login-Magic-Link**: TTL ~15 min, `expiresAt` kurz.
- **Invite-Magic-Link**: TTL 30 Tage, gleicher Konsum-Pfad. Der Token-Server
  prüft `consumedAt is null` und `expiresAt > now`.

Erkennung „erste Anmeldung" für die UI: der Member hat `invitedAt != null`
und keinen früheren Login (eigenes Feld dazu? — siehe Offene Fragen).

### Migrations

Vier sequentielle Drizzle-Migrations:

1. `add audit_entry table`
2. `add deactivation, invitation, first-login columns to member`
3. `add team_tag table`
4. `add member_team_tag junction table`

Keine Datenmigration nötig — alle bestehenden Mitglieder haben
`deactivatedAt=null` und gelten als nicht admin-deaktiviert, keine
Mannschafts-Tags zugewiesen.

## API-Endpoints

| Methode | Pfad                                            | Auth   | Zweck                                              |
|---------|-------------------------------------------------|--------|----------------------------------------------------|
| `GET`   | `/api/admin/members`                            | admin  | Liste aller Mitglieder (inkl. deaktivierte), filterbar |
| `POST`  | `/api/admin/members`                            | admin  | Einzelnes Mitglied manuell anlegen                 |
| `POST`  | `/api/admin/members/import`                     | admin  | CSV-Bulk-Import (multipart/form-data)              |
| `POST`  | `/api/admin/members/:id/invite`                 | admin  | Generiert Invite-Magic-Link, sendet Email via Brevo |
| `POST`  | `/api/admin/members/invite-bulk`                | admin  | Bulk-Invite über Liste von Member-IDs              |
| `POST`  | `/api/admin/members/:id/deactivate`             | admin  | Soft-Delete: `status='pausiert'` + `deactivatedAt` |
| `POST`  | `/api/admin/members/:id/reactivate`             | admin  | Hebt Admin-Deaktivierung auf                       |
| `PATCH` | `/api/admin/members/:id/roles`                  | admin  | Setzt `roles: Role[]` (mind. `player` bleibt)      |
| `PATCH` | `/api/admin/members/:id/lk`                     | admin/trainer | Korrigiert `dtbLk`                          |
| `PATCH` | `/api/admin/results/:id`                        | admin  | Korrigiert MatchResult oder FriendlyResult         |
| `GET`   | `/api/admin/audit-log`                          | admin/trainer | Liste Audit-Einträge, paginiert, filterbar  |
| `GET`   | `/api/team-tags`                                | admin/trainer | Liste aller Mannschafts-Tags (auch inaktive) |
| `POST`  | `/api/team-tags`                                | admin/trainer | Neues Tag (Name, sortOrder)                   |
| `PATCH` | `/api/team-tags/:id`                            | admin/trainer | Umbenennen, sortOrder, active toggeln         |
| `DELETE`| `/api/team-tags/:id`                            | admin  | Tag löschen (CASCADE auf member_team_tag)          |
| `PUT`   | `/api/members/:id/team-tags`                    | admin/trainer | Set vollständiger Tag-Liste am Mitglied      |

Auth-Anforderung: Server-Middleware `requireRole('admin')` für die meisten
Endpoints, `requireRole('admin', 'trainer')` für LK-Korrektur, Audit-Log
lesen und Mannschafts-Tag-Pflege (Spec §4.1 / FR-2i). Tag-Löschen bleibt
Admin-Only, weil es historische Zuordnungen wegwirft.

Mannschafts-Tag-Routes leben unter `/api/team-tags` statt `/api/admin/...`,
weil die Pflege ein gemeinsamer Bereich von Admin und Trainer ist und
konzeptionell nicht zum Admin-Modul gehört.

### CSV-Import-Schema

Spalten aus Spec FR-60: **Name, Geburtsjahr, Geschlecht, Email, DTB-LK**.

Anforderung an die CSV: **UTF-8** (BOM optional), Semikolon-getrennt (passt
zum deutschsprachigen Excel-Default). In Excel-Tipp im Upload-Dialog:
„Speichern als ‚CSV UTF-8 (durch Trennzeichen getrennt) (\*.csv)'". Andere
Encodings (Windows-1252) werden bewusst nicht unterstützt — der
Vereinsadmin macht den Import einmalig und kann die Datei vorher
konvertieren. Bei nicht-dekodierbaren Bytes Fehler `import.encoding-error`
mit dem Hinweis-Text.

```
firstName;lastName;birthYear;gender;email;dtbLk
Max;Müller;1985;m;max@example.org;8.3
Lisa;Schmidt;2008;w;lisa@example.org;14.5
```

Validierung serverseitig (Zod):

- `firstName`, `lastName` non-empty, max 100 Zeichen
- `birthYear` 1920–aktuelles Jahr
- `gender` enum `'m'|'w'`
- `email` Email-Format, lower-cased, unique
- `dtbLk` real 1.0–25.0

Ergebnis: ein Report-Objekt mit `imported`, `skipped` (Duplikate),
`errors` (mit Zeilennummer und Grund). Bei Duplikat auf Email-Basis
**update by default off** — Import legt nur neue Mitglieder an, das hält
den Initialimport idempotent gegen erneutes Hochladen.

### Audit-Log-Response

```typescript
type AuditLogEntry = {
  id: AuditEntryId
  actor: { id: MemberId; firstName: string; lastName: string }
  action: AuditAction
  subjectKind: string | null
  subjectId: string | null
  subjectLabel: string | null   // server-aufgelöst, z.B. "Tom Weber" oder "Challenge #42"
  before: unknown
  after: unknown
  note: string | null
  createdAt: Date
}
```

Filter: `?action=...`, `?actorId=...`, `?subjectId=...`, `?from=...&to=...`.
Pagination via `?cursor=...&limit=50`.

### Fehler-Codes

| Code                              | HTTP | Bedeutung                                                  |
|-----------------------------------|------|------------------------------------------------------------|
| `auth.role-required`              | 403  | Aufrufer ist nicht admin (oder trainer wo erlaubt)         |
| `member.not-found`                | 404  |                                                            |
| `member.duplicate-email`          | 409  | Beim Anlegen oder Import: Email existiert bereits          |
| `member.must-keep-player-role`    | 422  | Rollen-Update versucht alle Rollen zu entfernen            |
| `member.cannot-remove-own-admin`  | 422  | Admin entfernt sich selbst die Admin-Rolle (Lock-Out-Schutz) |
| `member.already-deactivated`      | 409  | Deaktivierung auf bereits deaktiviertem Mitglied           |
| `import.parse-error`              | 422  | CSV nicht lesbar (Trennzeichen, Header)                    |
| `import.encoding-error`           | 422  | Datei ist nicht UTF-8 — Hinweis auf „CSV UTF-8" in Excel    |
| `import.row-validation-failed`    | 422  | Mindestens eine Zeile invalid — Report enthält Details     |
| `team-tag.duplicate-name`         | 409  | Tag-Name existiert bereits (case-insensitive)              |
| `team-tag.not-found`              | 404  |                                                            |
| `result.not-found`                | 404  |                                                            |
| `result.confirmed-only`           | 422  | Korrektur nur an bestätigten Ergebnissen sinnvoll          |
| `lk.out-of-range`                 | 422  | LK außerhalb 1.0–25.0                                      |

## Cross-Modul-Aufrufe

Das `admin`-Modul ist ein Orchestrierungs-Modul wie `trainer`: eigene
Repo-Schicht für `auditEntry`, ansonsten Aufrufe in andere Module.

| Modul              | Service-Funktion (existiert/neu)             | Zweck                                               |
|--------------------|----------------------------------------------|-----------------------------------------------------|
| `members`          | `listAll(filters)` (neu)                     | Filter `deactivated`, `roles`, Suchstring          |
| `members`          | `createMember(input)` (neu)                  | manuelles Anlegen + Initial-`invitedAt=null`       |
| `members`          | `bulkCreate(rows)` (neu)                     | für CSV-Import, in Drizzle-Transaction              |
| `members`          | `setRoles(id, roles[])` (neu)                | inkl. Validierung `player` bleibt erhalten         |
| `members`          | `deactivate(id, reason)` / `reactivate(id)`  | setzt `status` + `deactivatedAt`                    |
| `members`          | `setLk(id, lk)` (neu)                        | korrigiert `dtbLk`                                  |
| `auth` / `magic-link` | `createInviteToken(memberId, ttlDays=30)` (neu) | TTL anders als Login-Token                      |
| `email` (Brevo)    | `sendInviteEmail(member, link)` (neu)        | Template „Willkommen bei ace"                       |
| `results`          | `adminCorrect(resultId, patch)` (neu)        | überschreibt Sätze/Sieger an bestätigtem Result    |
| `rankings`         | `recomputeFromResult(resultId)` (neu/refactor) | reapply nach Korrektur                            |
| `auth` / `magic-link` | Token-Konsum setzt `firstLoginAt` falls null | One-Liner im bestehenden Konsum-Pfad           |

### Eigenes Modul: `team-tags`

`team-tags` lebt als top-level Modul `server/modules/team-tags/` parallel
zum `admin`-Modul — passend zur Repo-Konvention (jedes Modul ist
top-level, kein bestehendes Modul hat Sub-Module) und zum neutralen
URL-Pfad `/api/team-tags`. Konsumenten (Profil, Rangliste, Member-Card)
importieren direkt aus `from '../team-tags'`, ohne über `admin` zu gehen.

```typescript
// server/modules/team-tags/index.ts
export const teamTagsService = {
  listAll(): TeamTagDto[]
  listForMember(memberId): TeamTagDto[]
  // create/update/delete/setAssignments folgen mit Endpoint-PR
}
```

Das `admin`-Modul exportiert für andere Module nur einen kleinen Helfer:

```typescript
// server/modules/admin/index.ts
export const auditService = {
  log(actor, action, subject, before, after, note): Promise<void>
}
```

Andere Module (`trainer`, später `rankings`) rufen `auditService.log(...)`
nach jedem korrektur-artigen Eingriff. Das hält die Audit-Schreib-Logik
zentral und macht es trivial, neue Aktionen aufzunehmen.

## UI-Skizze

Die Admin-Landing-Page [`/admin`](../../../app/pages/admin/index.vue) bekommt
die zwei aktuell ausgegrauten Tiles aktiviert: „Mitglieder" und „Audit-Log".

### `/admin/members` — Mitgliederliste

```
┌──────────────────────────────────────────────────────────────────┐
│  Mitglieder                              [CSV importieren] [+]   │
├──────────────────────────────────────────────────────────────────┤
│  Suche: [_______]  Status: [Alle ▾]  Rolle: [Alle ▾]            │
├──────────────────────────────────────────────────────────────────┤
│  Name              Email              Rollen    Status  LK       │
│  Max Müller        max@…              Spieler   aktiv   8.3   …  │
│  Anna Admin        anna@…             Sp,Admin  aktiv   12.4  …  │
│  Tim Inaktiv       tim@…              Spieler   inaktiv 15.0  …  │
│  Lisa Neu          lisa@…             —         pendend  —    …  │
└──────────────────────────────────────────────────────────────────┘
```

Zeilen-Aktionen im `…`-Menü: **Rollen ändern**, **Einladen**, **LK ändern**,
**Deaktivieren** / **Reaktivieren**. Massenaktion über Checkbox-Spalte:
**Auswahl einladen**.

`pendend` = `invitedAt != null` und Member hat sich noch nie angemeldet.

### `/admin/members/new` — manuelle Anlage

Einfaches Formular: Vorname, Nachname, Geburtsjahr, Geschlecht, Email,
DTB-LK. Submit + „Anlegen & Einladung senden" als zweiter Knopf.

### `/admin/members/import` — CSV-Import

Drag-Drop-Feld, Preview der ersten 5 Zeilen mit Parse-Status, danach
„Import starten" → Ergebnis-Report (X angelegt / Y übersprungen / Z Fehler
mit Zeilen-Liste).

### `/admin/members/:id/roles` (Modal oder Drawer auf der Liste)

Drei Checkboxen Spieler/Trainer/Admin, Spieler nicht abwählbar. Bei
Admin-Entzug an sich selbst Hinweis-Toast.

### `/team-tags` — Mannschafts-Tags (gemeinsam für Admin und Trainer)

```
┌──────────────────────────────────────────────────────┐
│  Mannschaften                              [+ Neu]   │
├──────────────────────────────────────────────────────┤
│  ↕  Name              Mitglieder  Status     Aktion  │
│  1  1. Herren              8      aktiv      ✎  …    │
│  2  2. Herren              7      aktiv      ✎  …    │
│  3  Damen 30               5      aktiv      ✎  …    │
│  4  Junioren (alt)         0      archiviert ✎  …    │
└──────────────────────────────────────────────────────┘
```

Drag-to-Reorder für `sortOrder`, Inline-Rename, Archiv-Toggle. „…"-Menü:
Löschen (nur Admin, mit Confirm bei Mitgliedern > 0). Trainer sehen
„Löschen" deaktiviert mit Tooltip „nur Admin".

### UserMenu-Einträge

- **Admin**: bestehender „Admin-Bereich" + neuer Eintrag „Mannschaften" → `/team-tags`
- **Trainer**: bestehender „Trainer-Bereich" + neuer Eintrag „Mannschaften" → `/team-tags`
- Player ohne Rolle sieht den Eintrag nicht.

### Tag-Editor am Mitglied (Modal aus `/admin/members`)

```
┌──────────────────────────────────────────────┐
│  Tom Weber · Mannschaften                    │
├──────────────────────────────────────────────┤
│  [x] 1. Herren                               │
│  [ ] 2. Herren                               │
│  [x] Bezirksliga                             │
│  [ ] Damen 30                                │
│  [ ] Junioren (alt) — archiviert             │
│                              [Abbrechen][OK] │
└──────────────────────────────────────────────┘
```

Archivierte Tags sind sichtbar, aber nicht setzbar; bereits gesetzte
archivierte Tags bleiben gecheckt. Multi-Select, kein Limit.

### Mannschaftsspalte in `/admin/members`

Die Mitgliederliste bekommt eine zusätzliche Spalte „Mannschaften" mit
Komma-Liste der zugewiesenen Tags (kompakt: erste 2 + „+N" bei mehr).
Filter über die Mannschaft im Header.

### `/admin/audit` — Audit-Log-Seite

```
┌──────────────────────────────────────────────────────────────────┐
│  Audit-Log                                                        │
├──────────────────────────────────────────────────────────────────┤
│  Aktion: [Alle ▾]  Akteur: [Alle ▾]  Zeitraum: [letzte 30 T ▾]   │
├──────────────────────────────────────────────────────────────────┤
│  2026-05-17 14:32  Anna Admin  member.role-changed → Tom Weber   │
│  → Rollen: [player] → [player, trainer]                          │
│  ────────────────────────────────────────────────────────────────│
│  2026-05-17 12:08  Tom Trainer  result.dispute-decided           │
│  → Challenge #42, „bestätigt wie gemeldet"                       │
│  ...                                                              │
└──────────────────────────────────────────────────────────────────┘
```

Mobile-First (NFR-1): Liste klappt auf Smartphone in eine Karten-Ansicht
mit Akteur und Aktion in der Kopfzeile, Diff als kleines Detail.

## Hintergrund-Jobs

Keine neuen Cron-Jobs. Eine spätere Erweiterung könnte ablaufende
Invitation-Tokens aufräumen (`expiresAt < now`), aber MagicLinkTokens haben
schon einen Index auf `consumedAt`, und ein nightly Job dafür kann später
generisch im `auth`-Modul leben.

## Validierung und Edge-Cases

- **Letzter Admin**: Wenn das letzte verbleibende Member mit `admin`-Rolle
  versucht, sich selbst die Admin-Rolle zu entziehen oder sich zu
  deaktivieren → Fehler `member.cannot-remove-own-admin`. UI zeigt
  „Mindestens ein Admin muss aktiv bleiben."
- **Rollen-Update entfernt alle Rollen**: zurückweisen — Player bleibt
  immer Default-Rolle. UI deaktiviert die `player`-Checkbox.
- **CSV mit BOM**: Server akzeptiert UTF-8-BOM transparent.
- **CSV mit Komma statt Semikolon**: Parse-Versuch erst mit `;`, dann mit
  `,` Fallback. Fehler `import.parse-error`, wenn beide keinen sinnvollen
  Header ergeben.
- **Duplicate Email beim Import**: zählt als `skipped`, kein Fehler.
- **Deaktivierung eines Mitglieds mit offenen Challenges**: nicht
  blockieren — laufende Challenges/Friendlies laufen aus (Auto-Expire), das
  Mitglied taucht in keinen neuen Vorschlägen mehr auf. Audit-Eintrag
  reicht.
- **LK-Korrektur**: ändert nur `member.dtbLk`. Bestehende Rangliste-Einträge
  und Match-Results bleiben unverändert — Rangliste rechnet sich aus
  Match-Ergebnissen, nicht aus aktueller LK.
- **Ergebnis-Korrektur an einem Match, das schon Rangliste mutiert hat**:
  Atomar: lese alte Werte → schreibe neue → rufe
  `rankings.recomputeFromResult` → Audit. Wenn der Recompute fehlschlägt
  (z. B. wegen einer abhängigen Saisonschließung), wird die gesamte
  Transaction zurückgerollt.
- **Trainer im Audit-Log**: Trainer dürfen lesen, weil sie selbst Einträge
  erzeugen (Dispute-Entscheidungen) und nachvollziehen können sollen, was
  andere Trainer/Admins getan haben. Schreibt nur Admin direkte
  Einträge — Trainer schreiben nur indirekt über ihre eigenen Aktionen.
- **Eltern-Kind-Routing**: Admin-Aktionen treffen direkt das Kind-Member —
  keine Sonder-Logik nötig, weil Admin universellen Zugriff hat.
- **Brevo-Email-Versand-Fehler**: Einladungs-Token wird trotzdem
  geschrieben. UI zeigt Warnung mit Copy-Link-Knopf als Fallback. Audit-
  Eintrag `member.invited` wird in beiden Fällen geschrieben.
- **Tag-Namen case-insensitive eindeutig**: „1. Herren" und „1. herren"
  sind dasselbe (Unique-Index auf `lower(name)`).
- **Tag-Löschung mit Mitgliedern**: CASCADE entfernt alle Zuordnungen.
  UI fragt explizit nach Confirm mit Mitgliederzahl. Alternative
  „Archivieren" (active=false) ist im Confirm prominent angeboten.
- **`firstLoginAt` bei bestehenden Mitgliedern**: Migration setzt das
  Feld nicht — die existierenden Mitglieder gelten in der UI also alle
  als „pendend", bis sie sich das nächste Mal einloggen. Für den
  Soft-Launch egal, weil das Feature mit dem CSV-Import-Wave kommt.

## Tests

- **Unit `admin.audit-service`**: schreibt korrekten Eintrag, serialisiert
  before/after, Indexfelder gesetzt.
- **Unit `admin.csv-parse`**: BOM, Trennzeichen-Erkennung,
  Validierungs-Fehler mit Zeilennummer.
- **Unit `admin.last-admin-guard`**: verhindert Selbst-Entzug, verhindert
  Deaktivierung des letzten Admins.
- **Integration**: CSV-Upload mit 3 gültigen + 2 ungültigen Zeilen → 3
  angelegt, 2 Fehler im Report.
- **Integration**: Bulk-Invite an 5 Mitglieder, alle bekommen Token mit
  TTL 30 Tage.
- **Integration**: Rollen-Update setzt `trainer` zusätzlich zu `player` →
  Audit-Eintrag erzeugt.
- **Integration**: Result-Korrektur an bestätigtem MatchResult →
  Ranking-Recompute, Audit-Eintrag mit Diff der Sätze.
- **Integration**: Deaktivierung → `status='pausiert'` +
  `deactivatedAt`-Timestamp, Mitglied verschwindet aus Vorschlag-Liste,
  Friendlies/Challenges-Listen zeigen den Spieler weiter.
- **Integration**: Player-Role bekommt 403 auf alle Admin-Routen.
- **Integration**: Team-Tag anlegen, umbenennen, archivieren, löschen
  (mit CASCADE-Verifikation).
- **Integration**: Mitglied bekommt 3 Tags, Tag-Set wird auf 1
  reduziert → nur 1 Junction-Row übrig + Audit-Eintrag mit before/after.
- **Integration**: Trainer-Role darf Team-Tag-Endpoints außer DELETE.
- **Manuell**: Einladungs-Email kommt bei Brevo-Testaccount an, Link
  funktioniert, neuer Member kann Profil ausfüllen, `firstLoginAt` wird
  gesetzt.

## Entscheidungen

Folgende Fragen wurden während der Design-Phase entschieden:

- **Tag-Pflege-UI**: gemeinsamer Pfad `/team-tags` (kein `/admin`- oder
  `/trainer`-Präfix), Auth `admin|trainer`, Eintrag in beide UserMenüs.
- **Audit-Retention**: unbegrenzt in v1 (Volumen ~hunderte Einträge/Jahr).
- **CSV-Import-Modus**: nur Insert, keine Update-Variante.
  Korrekturen über Single-Member-Edit.
- **Re-Aktivierung**: ohne Grund-Freitext — Audit-Eintrag reicht.
- **Trainings­gruppen (FR-122)**: nicht in `team_tag` zusammenführen —
  bleibt eigenes Modell, kommt mit Trainer-Modul-Erweiterung.

## Offene Fragen

— keine —

## Abhängigkeiten zu anderen Features

- [`trainer`](../trainer/design.md) ist parallel im Werden — das
  `auditService.log(...)` aus diesem Doc wird vom Trainer-Modul mit
  benutzt. Reihenfolge: `admin` zuerst (liefert Audit-Service und
  -Schema), `trainer` rüstet darauf seine Disputed-Aktionen auf
  Audit-Logging um.
- [Magic-Link-Token-Modul](../core-auth-members/design.md) ist vorhanden —
  Invite-Funktion ist eine kleine Erweiterung des bestehenden Token-Pfads.

## Out of Scope für diesen Schritt

- Trainings­gruppen-Kategorisierung (FR-122) — eigenes Modell, kommt mit
  Trainer-Modul-Erweiterung
- KPI-Konfiguration (FR-121) — kommt mit UI-Redesign
- Challenge-Regeln pro Saison editierbar (FR-64) — Code-Deploy reicht
- Konfigurierbare Limits (FR-117) — Code-Deploy reicht
- Blockierungen-Moderationssicht — Block-Modell fehlt noch
- Endgültige DSGVO-Löschung — manueller SQL-Eingriff für v1
- Mehrsprachigkeit der Einladungs-Email — deutsch reicht
- 2FA für Admin-Accounts — Magic-Link reicht für v1
