# Feature-Design-Doc: `core-auth-members`

**Status**: entwurf
**Datum**: 2026-05-14
**Module**: [`auth`](../../architecture/overview.md#1-modul-schnitt), [`members`](../../architecture/overview.md#1-modul-schnitt)

## Ziel

Das absolut minimale Fundament der Plattform: ein Mitglied kann sich per
Email-Magic-Link einloggen, sein eigenes Profil sehen und bearbeiten, sich
ausloggen. Mehr nicht — andere Profile, Sichtbarkeitsstufen, Eltern-Kind und
Rollen-Management sind eigene Features.

Begründung für die Bündelung: `auth` braucht ein `Member`-Entity, auf das die
Session zeigt — die beiden müssen zusammen entstehen. Sobald dieses Feature
steht, kann jedes weitere Feature darauf aufbauen.

## Spec-Bezug

| FR-ID / NFR-ID | Kurzbeschreibung                                  | Abgedeckt durch                                |
|----------------|---------------------------------------------------|------------------------------------------------|
| FR-1           | Profil: Name, Geburtsjahr, Geschlecht, LK         | `Member`-Schema + `PATCH /api/members/me`      |
| FR-1a, FR-1b   | Spielarten-Präferenzen, Defaults                  | `Member.preferences` als JSON-Feld + Defaults  |
| FR-2a          | LK Default 25 für neue Spieler                    | Schema-Default                                  |
| FR-2b          | Spieler aktualisiert LK selbst                    | `PATCH /api/members/me`                        |
| FR-4           | Status aktiv / pausiert                           | `Member.status` + Toggle in `/profile`         |
| FR-40 (Teil)   | Eigener Account ab 14 — Eltern-Verwaltung später  | Nur Erwachsenen-Login; ParentChildLink folgt   |
| FR-114         | Magic-Link max. 3/Stunde/Email                    | Rate-Limit-Service                              |
| NFR-2          | Auth per Email-Magic-Link                         | Implementierung                                 |
| NFR-11         | Magic-Link in unter 30 s zugestellt               | Brevo + transparente Dev-Stub                  |

**Nicht abgedeckt** von diesem Feature (verschoben):

- FR-2c–FR-2j (Trainer-/Admin-LK-Korrektur, Altersgruppen-Zuordnung, Mannschafts-Tags) → `admin` und `seasons`
- FR-6 ff. (Sichtbarkeits-Stufen) → eigenes Feature `member-visibility`
- FR-40a–FR-40c (Eltern-Kind-Verwaltung) → eigenes Feature `youth-parent-flow`
- FR-60, FR-62 (CSV-Import, Rollen-Management) → eigenes Feature `admin`
- FR-116 (Block-Funktion) → eigenes Feature `member-blocks`
- Notification-Preferences → eigenes Feature `notifications`

## Datenmodell

Drei neue Drizzle-Schemata, plus ein Connection-Helper für SQLite.

### `Member` ([`server/db/schema/member.ts`](../../../server/db/schema/member.ts))

```typescript
export const member = sqliteTable('member', {
  id: integer('id').primaryKey({ autoIncrement: true }).$type<MemberId>(),
  email: text('email').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  birthYear: integer('birth_year').notNull(),
  gender: text('gender', { enum: ['m', 'w'] }).notNull(),
  dtbLk: real('dtb_lk').notNull().default(25.0),
  status: text('status', { enum: ['aktiv', 'pausiert'] }).notNull().default('aktiv'),
  roles: text('roles', { mode: 'json' })
    .$type<Role[]>()
    .notNull()
    .default(['player']),
  preferences: text('preferences', { mode: 'json' })
    .$type<MatchPreferences>()
    .notNull()
    .default({
      singlesChallenges: true,
      singlesFriendly: true,
      doublesFriendly: false,
      mixedFriendly: false,
      ageGroupFriendly: false,
    }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$default(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$default(() => new Date()),
})
```

`MemberId` als Branded Type in `server/modules/members/types.ts` definiert.

### `MagicLinkToken` ([`server/db/schema/magic-link-token.ts`](../../../server/db/schema/magic-link-token.ts))

```typescript
export const magicLinkToken = sqliteTable('magic_link_token', {
  token: text('token').primaryKey(),                  // 32-Byte hex, kryptografisch zufällig
  memberId: integer('member_id')
    .notNull()
    .references(() => member.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$default(() => new Date()),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  consumedAt: integer('consumed_at', { mode: 'timestamp' }),
})
```

Index auf `memberId + createdAt` für Rate-Limit-Lookups.

### `RateLimitEvent` ([`server/db/schema/rate-limit-event.ts`](../../../server/db/schema/rate-limit-event.ts))

Generischer Counter für Email-basierte Rate-Limits — auch für andere Features
nutzbar (FR-110, FR-113).

```typescript
export const rateLimitEvent = sqliteTable('rate_limit_event', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull(),                         // z. B. 'magic-link:max@neureut.de'
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
})
```

Index auf `key + occurredAt`.

### Sessions

Werden **nicht** als DB-Tabelle gespeichert — `nuxt-auth-utils` packt sie in
verschlüsselte HTTP-only-Cookies (signiert mit `NUXT_SESSION_PASSWORD`).
Inhalt der Session laut [Architektur-Übersicht § 6.2](../../architecture/overview.md#62-session):

```typescript
{ memberId: MemberId, roles: Role[] }
// parentOf: MemberId[] kommt mit Eltern-Kind-Feature
```

### Migrations

Eine initiale Migration `0001_initial.sql`, generiert via
`pnpm drizzle-kit generate`. Anwendung im Dev über
`pnpm drizzle-kit push` (Schema direkt in lokale DB pushen) — produktiv per
`pnpm drizzle-kit migrate`.

### Connection-Helper

[`server/db/index.ts`](../../../server/db/index.ts) öffnet die SQLite-Datei,
setzt die Pragmas (`journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`)
und exportiert das Drizzle-Client-Objekt.

## API-Endpoints

| Methode | Pfad                              | Auth                  | Zweck                                           |
|---------|-----------------------------------|-----------------------|-------------------------------------------------|
| `POST`  | `/api/auth/request-link`          | öffentlich            | Email-Adresse einlösen, Token generieren, Mail  |
| `GET`   | `/api/auth/confirm/:token`        | öffentlich (mit Token)| Token einlösen, Session setzen, Redirect zu `/` |
| `POST`  | `/api/auth/logout`                | session               | Session-Cookie löschen                          |
| `GET`   | `/api/auth/session`               | öffentlich            | Aktuelle Session (oder leeres Objekt)           |
| `GET`   | `/api/members/me`                 | session               | Eigenes Profil                                  |
| `PATCH` | `/api/members/me`                 | session               | Eigenes Profil ändern                           |

### Request-/Response-Schemas (Zod)

Alle Schemas leben in `server/modules/<modul>/types.ts`. Beispiele:

```typescript
// auth/types.ts
export const requestLinkInput = z.object({
  email: z.string().email().max(120),
})

// members/types.ts
export const updateOwnProfileInput = z.object({
  firstName: z.string().min(1).max(60).optional(),
  lastName:  z.string().min(1).max(60).optional(),
  birthYear: z.number().int().gte(1920).lte(2020).optional(),
  gender:    z.enum(['m', 'w']).optional(),
  dtbLk:     z.number().min(1).max(25).optional(),
  status:    z.enum(['aktiv', 'pausiert']).optional(),
  preferences: matchPreferencesSchema.optional(),
})
```

### Fehler-Codes

| Code                       | HTTP | Bedeutung                                                  |
|----------------------------|------|------------------------------------------------------------|
| `auth.rate-limit-exceeded` | 429  | > 3 Magic-Link-Anfragen pro Stunde (FR-114)                |
| `auth.invalid-token`       | 400  | Token unbekannt, abgelaufen, bereits konsumiert            |
| `auth.session-required`    | 401  | Keine gültige Session                                      |
| `member.not-found`         | 404  | Member zur Session existiert nicht (Datenkonsistenz)       |

## Cross-Modul-Aufrufe

| Aufrufer           | Aufgerufen        | Service-Funktion                       | Zweck                              |
|--------------------|-------------------|----------------------------------------|------------------------------------|
| `auth`             | `members`         | `findMemberByEmail(email)`             | Magic-Link an existierenden User   |
| `auth`             | `members`         | `findMemberById(id)`                   | Session-Auflösung                  |
| `auth`             | `notifications`   | *(noch nicht — Brevo direkt)*          | Email-Versand                       |
| `members`          | —                 | nichts                                 | minimal                            |

Email-Versand: in diesem Feature **direkt** im `auth`-Modul, weil das
`notifications`-Modul noch nicht existiert. Wenn das Notifications-Feature kommt,
wird der Aufruf umgezogen.

## Hintergrund-Jobs

Ein einziger Cron in diesem Feature:

| Job                       | Frequenz | Modul   | Zweck                                              |
|---------------------------|----------|---------|----------------------------------------------------|
| `cleanup-expired-tokens`  | täglich  | `auth`  | Abgelaufene `MagicLinkToken`-Zeilen löschen        |

Implementiert in [`server/tasks/cleanup-expired-tokens.ts`](../../../server/tasks/cleanup-expired-tokens.ts)
via Nitro experimental tasks. Idempotent — löscht nur Tokens mit
`expiresAt < now`.

## UI-Skizze

### `/login` — Email-Eingabe

```
┌────────────────────────────────────────┐
│  Anmelden bei ace                      │
│                                        │
│  Email-Adresse                         │
│  ┌──────────────────────────────────┐  │
│  │ max@neureut.de                   │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [   Magic-Link senden   ]             │
│                                        │
│  Hinweis: Wir schicken dir einen       │
│  Login-Link per Email. Kein Passwort.  │
└────────────────────────────────────────┘
```

- Bei Submit: `POST /api/auth/request-link`, dann Redirect zu `/login/check-email`
- Fehler bei `429`: freundliche Meldung „zu viele Versuche, bitte in einer Stunde wieder"
- Fehler bei `400` (Validation): unter dem Input rot

### `/login/check-email` — Bestätigung

```
┌────────────────────────────────────────┐
│  Check deine Email                     │
│                                        │
│  Wir haben dir einen Link an           │
│  max@neureut.de geschickt.             │
│                                        │
│  Der Link ist 15 Minuten gültig.       │
│                                        │
│  Keine Email? In den Spam-Ordner       │
│  schauen oder hier nochmal anfordern.  │
└────────────────────────────────────────┘
```

### `/api/auth/confirm/:token` — kein UI, nur Redirect

- Bei Erfolg: Session setzen, Redirect zu `/`
- Bei Fehler: Redirect zu `/login?error=invalid-token`

### `/profile` — Eigenes Profil bearbeiten (NUR eigenes)

```
┌────────────────────────────────────────┐
│  Mein Profil                  [Logout] │
│                                        │
│  Vorname        Max                    │
│  Nachname       Müller                 │
│  Geburtsjahr    1985                   │
│  Geschlecht     ◉ Männlich             │
│                 ○ Weiblich             │
│  DTB-LK         8.3                    │
│  Status         ◉ Aktiv                │
│                 ○ Pausiert             │
│                                        │
│  Spielarten                            │
│  ☑ Einzel-Challenges                   │
│  ☑ Einzel-Freundschaftsspiele          │
│  ☐ Doppel-Freundschaftsspiele          │
│  ☐ Mixed-Freundschaftsspiele           │
│  ☐ Altersklassen-Freundschaftsspiele   │
│                                        │
│         [    Speichern    ]            │
└────────────────────────────────────────┘
```

- Mobile-first: Inputs untereinander mit großen Touch-Targets
- Button-Bar unten, sticky bei Scroll
- Erfolg: Toast „Profil aktualisiert"
- Fehler: Inline-Validierung pro Feld

### `/` — Minimal-Home

Sehr schlicht in diesem Feature — Liste der nächsten echten Features als
Platzhalter. Wird in der zweiten Iteration zum Dashboard.

```
┌────────────────────────────────────────┐
│  Willkommen, Max          [Mein Profil]│
│                                        │
│  Du bist als Spieler eingeloggt.       │
│                                        │
│  Die Plattform-Features sind in        │
│  Entwicklung. Bald hier:               │
│                                        │
│  • Rangliste                            │
│  • Challenges                           │
│  • Freundschaftsspiele                  │
│  • Match-Vorschläge                     │
└────────────────────────────────────────┘
```

## Validierung und Edge-Cases

- **Unbekannte Email-Adresse bei `request-link`**: Status 200 zurückgeben (keine
  User-Enumeration), Email nicht versenden, kein Token erstellt
- **Token bereits konsumiert**: 400, redirect zu `/login?error=token-used`
- **Token abgelaufen**: 400, redirect zu `/login?error=token-expired`
- **Email mit unterschiedlicher Großschreibung**: Lookup case-insensitive
  (Email wird beim Speichern lowercased)
- **Spieler unter 14**: in dieser Phase blockieren — eigene Fehlermeldung
  „Spieler unter 14 brauchen einen Eltern-Account, der noch nicht verfügbar ist"
- **Pausiert markieren**: erlaubt, Member bleibt eingeloggt; FR-25c verhindert
  später, dass pausierte Spieler challengebar sind — kommt im `challenges`-Feature
- **Rate-Limit Magic-Link**: Counter pro Email-Adresse (nicht IP, da viele User
  im selben WLAN). FR-114: 3/Stunde

## Tests

- **Unit**:
  - `auth/service/token.ts`: Token-Generierung, Validierung, Konsumierung
  - `auth/service/rate-limit.ts`: Zähler-Logik
  - `members/service/profile.ts`: Update-Validierung
- **Integration** (gegen In-Memory-SQLite):
  - `POST /api/auth/request-link`: 200 für unbekannten, 200 für bekannten User,
    429 bei Rate-Limit
  - `GET /api/auth/confirm/:token`: Erfolg, ungültig, abgelaufen, doppelt
    konsumiert
  - `GET/PATCH /api/members/me`: ohne Session 401, mit Session korrekte Daten
- **Manuell**:
  - Echte Email durch Brevo-Sandbox versenden
  - Mobile-Layout auf Handy testen

## Email-Versand: Brevo + Dev-Stub

- Produktiv: Brevo Transactional Email API
- Dev (kein `NUXT_BREVO_API_KEY` gesetzt): in Konsole loggen mit
  `[Email Stub] Magic-Link für max@neureut.de: http://localhost:3000/api/auth/confirm/abc...`
- Template inline im Code (keine Template-Engine in v1), nur 2 Sprachen-Varianten
  vorgesehen (de) — Spec NFR-8

## Seed-Script

[`server/db/seed.ts`](../../../server/db/seed.ts) erzeugt drei Test-Member:
- `max@neureut.de` — Spieler Aktive Herren
- `lisa@neureut.de` — Spielerin Aktive Damen
- `admin@neureut.de` — mit `roles: ['admin', 'player']`

Ausgeführt via `pnpm db:seed`.

## Konfiguration (`.env`)

Bereits in `.env.example` vorhanden:
- `NUXT_SESSION_PASSWORD` (Pflicht)
- `NUXT_BREVO_API_KEY` (Pflicht produktiv, optional dev)
- `NUXT_DB_PATH` (Default `./data/ace.db`)
- `NUXT_PUBLIC_BASE_URL`

## Geklärte Punkte vor Implementierung

- **LK-Skala**: DTB-LK 1.0–25.0 in 0.1-Schritten (Validation `min(1) max(25)`
  mit Float-Werten)
- **Geschlecht**: `m` / `w`. Entspricht der DTB-Klassifizierung. Die „Offene
  Rangliste" (FR-10) ist für Mixed-Spiel zwischen Herren und Damen gedacht,
  nicht für eine dritte Geschlechtsklasse.
- **Mehrfach-Magic-Link-Requests**: Tokens bleiben parallel gültig bis Ablauf
  oder Konsumierung. Vorherige Tokens werden bei einem neuen Request *nicht*
  invalidiert — minimaler Code, akzeptable UX bei 15-Minuten-TTL.
- **E-Mail-Template**: HTML-Email im Spec-Stil (Source Sans, Tennisplatz-Grün
  als Primary), Plain-Text-Fallback verpflichtend. Inline-CSS, keine externen
  Assets — damit Email-Clients sie zuverlässig rendern.

## Offene Fragen

Keine — alle Punkte sind geklärt.

## Abhängigkeiten zu anderen Features

Dieses Feature ist die Wurzel — keine Abhängigkeiten. Es ist Voraussetzung für:

- `member-visibility` (braucht Member)
- `youth-parent-flow` (braucht Member + ParentChildLink)
- `seasons` (braucht Admin-Rolle, die hier nur als String existiert — Rollen-
  Management wird mit `admin`-Feature ausgebaut)
- alle weiteren Features

## Out of Scope für diesen Schritt

Bewusst NICHT enthalten:

- Andere Mitglieder sehen — `member-visibility` und `member-directory` später
- Profil-Foto-Upload — eigene UX-Entscheidung, später
- Email-Adresse ändern — Risiko-Feature, später mit zweiter Bestätigung
- Account-Löschung (DSGVO Recht auf Löschung) — `admin`-Feature und
  Soft-Delete-Strategie nötig
- Trainer-Funktionen auf Member-Daten — `trainer`-Feature
- Audit-Log für Profil-Änderungen — `admin`-Feature
- Mehrsprachigkeit über `de` hinaus
- Pen-Test der Auth-Flow (kommt vor Produktiv-Rollout)
