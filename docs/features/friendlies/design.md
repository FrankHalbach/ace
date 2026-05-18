# Feature-Design-Doc: `friendlies`

**Status**: entwurf
**Datum**: 2026-05-15
**Modul**: [`friendlies`](../../architecture/overview.md#1-modul-schnitt)

> **Stand 2026-05-18 (Issue #57, vor-Launch):** Von den unten beschriebenen
> Match-Modi ist aktuell nur `two-sets-match-tiebreak` aktiv (2 Gewinnsätze,
> im Entscheidungssatz Match-Tiebreak bis 10). Weitere Modi sind in
> Issue #58 für Phase 2 vorgesehen.

## Ziel

Mitglieder verabreden sich für Einzel- oder Doppel-Freundschaftsspiele —
ohne Rangliste-Auswirkung, ohne Cooldown, ohne Sprungregeln. Das Ergebnis
ist optional; das Match zählt für die Aktivitäts-Statistik auch dann, wenn
nichts eingetragen wird.

Damit ist die App **funktional komplett im Vernetzungs-Pfeiler**: neben dem
Wettkampf-Pfad (Challenges) gibt es jetzt den niederschwelligen
Vernetzungs-Pfad — und Doppel ist überhaupt erst spielbar (siehe
[CLAUDE.md § Out of Scope](../../../CLAUDE.md): „Doppel nur als
Freundschaftsspiel").

## Spec-Bezug

| FR-ID  | Kurzbeschreibung                                        | Abgedeckt durch                                |
|--------|---------------------------------------------------------|------------------------------------------------|
| FR-90  | Einzel oder Doppel                                      | `Friendly.format`                              |
| FR-91  | Initiator, Eingeladene, Datum/Uhrzeit, Platz, Notiz     | `Friendly` + `FriendlyInvitee`                  |
| FR-92  | Eingeladene nehmen an / lehnen ab; Doppel: alle 3       | `accept`/`decline`-Endpoints + Status-Engine    |
| FR-93  | Ergebnis optional, Aktivität zählt trotzdem             | Status `PLAYED` + `lastFriendlyAt`              |
| FR-94  | Keine Cooldowns, keine Sprung-Regeln, keine ELO-Wirkung | Friendlies berühren `RankingEntry` nicht       |
| FR-30  | Sieger meldet Ergebnis mit Sätzen                       | `POST /api/friendlies/:id/result`              |
| FR-30b | Match-Modi konfigurierbar                               | Modus-Wahl bei Anlage (Default aus AgeGroup)   |
| FR-30d | Modus einvernehmlich änderbar bei Anlage Friendly       | Modus-Auswahl im Create-Form                   |
| FR-30e | Validierung passt sich dem Modus an                     | gleiche Zod-Schemas wie Challenges-Results     |
| FR-31  | Verlierer bestätigt oder widerspricht                   | `POST /api/friendly-results/:id/confirm` + `/dispute` |
| FR-32  | Bei Widerspruch / 3 Tage Reaktion → Streitfall          | Status `DISPUTED`, Cron `auto-dispute-friendlies` |
| FR-35  | Bestätigte Ergebnisse unveränderlich                    | DB-Constraint, Admin-Korrektur out of scope    |
| FR-6   | Match-Präferenzen pro Profil                            | Soft-Warning bei Einladung gegen Präferenz     |

**Nicht abgedeckt** (verschoben):

- FR-95 (offene Such-Posts „Suche Mittwoch 19 Uhr") — eigenes Sub-Feature
  `friendly-search` mit eigenem UI-Flow, später
- FR-96 (Trainer initiieren im Auftrag von Jugend) — abhängig vom
  Eltern-Kind-Modul (FR-40), das noch nicht existiert
- FR-34 (Walk-over im Friendly) — über `dispute` initial, eigener Endpoint später
- N-01 Punkte für Friendlies (Punkte-Tabelle-Modus) — der Nachtrag lässt
  ungeklärt, welcher Rangliste die Punkte gutgeschrieben werden, wenn ein
  Friendly mehrere Ranglisten desselben Spielers berührt. Vorerst keine
  Punkte-Vergabe für Friendlies. Vor dem nächsten Iterationsschritt klären.
- Mixed-/Altersklassen-Filter beim Spieler-Auswahl — Präferenzen werden nur als
  Soft-Warning ausgewertet, kein eigener Filter
- Auto-Markierung als `PLAYED` per Cron nach Termin — manuell durch
  Teilnehmer („wir haben gespielt, kein Ergebnis"). Cron-Variante kommt mit
  Aktivitäts-Statistik-Feature später

## Datenmodell

### `Friendly`

```typescript
export const friendly = sqliteTable('friendly', {
  id: integer('id').primaryKey({ autoIncrement: true }).$type<FriendlyId>(),
  initiatorId: integer('initiator_id').notNull()
    .references(() => member.id, { onDelete: 'cascade' }).$type<MemberId>(),
  format: text('format', { enum: ['singles', 'doubles'] }).notNull(),
  scheduledAt: integer('scheduled_at', { mode: 'timestamp' }).notNull(),
  courtInfo: text('court_info'),       // optional, freier Text („Platz 3", „Halle")
  note: text('note'),                   // optional, max. 500 Zeichen
  matchMode: text('match_mode', {
    enum: ['best-of-3-tiebreak', 'best-of-3-full', 'best-of-3-champions',
           'short-sets-tiebreak', 'pro-set'],
  }).notNull(),

  status: text('status', {
    enum: ['PROPOSED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'PLAYED', 'COMPLETED', 'DISPUTED'],
  }).notNull().default('PROPOSED'),

  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull().default(sql`(unixepoch())`),
  confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),    // alle Eingeladenen haben angenommen
  declinedAt: integer('declined_at', { mode: 'timestamp' }),      // mind. einer hat abgelehnt
  cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),    // Initiator hat zurückgezogen
  playedAt: integer('played_at', { mode: 'timestamp' }),          // markiert als gespielt ohne Ergebnis
  completedAt: integer('completed_at', { mode: 'timestamp' }),    // Ergebnis bestätigt
  disputedAt: integer('disputed_at', { mode: 'timestamp' }),
})
```

Status-Lifecycle:

```
PROPOSED ──(letzte Eingeladene nimmt an)──> CONFIRMED
   │                                            │
   │ (eine/r lehnt ab)                          │ (Termin gespielt, kein Ergebnis)
   ▼                                            ▼
DECLINED                                      PLAYED ───(Ergebnis nachgemeldet)──> ┐
                                              │                                     │
                                              ▼                                     ▼
                                          CANCELLED                              COMPLETED  (oder DISPUTED)
   ▲                                          ▲                                     │
   │ (Initiator zieht zurück, jeder Status    │                                     │
   │  außer COMPLETED/DISPUTED)               │                                     │
```

Indizes: `(initiatorId, status)`, `(scheduledAt)` für Aktivitäts-Reports.

### `FriendlyInvitee`

```typescript
export const friendlyInvitee = sqliteTable('friendly_invitee', {
  id: integer('id').primaryKey({ autoIncrement: true }).$type<FriendlyInviteeId>(),
  friendlyId: integer('friendly_id').notNull()
    .references(() => friendly.id, { onDelete: 'cascade' }).$type<FriendlyId>(),
  memberId: integer('member_id').notNull()
    .references(() => member.id, { onDelete: 'cascade' }).$type<MemberId>(),

  // Bei singles: ein einziger Invitee mit team='opponent'
  // Bei doubles:  ein Invitee team='initiator' (Partner des Initiators)
  //               + zwei Invitees team='opponent'
  team: text('team', { enum: ['initiator', 'opponent'] }).notNull(),

  status: text('status', { enum: ['pending', 'accepted', 'declined'] })
    .notNull().default('pending'),
  respondedAt: integer('responded_at', { mode: 'timestamp' }),
}, (t) => [
  uniqueIndex('friendly_invitee_unique').on(t.friendlyId, t.memberId),
])
```

Der Initiator ist **nicht** als Invitee gespeichert (er hat per Definition
zugesagt). Im UI wird das Initiator-Team als „Du + Partner" gerendert; die
Logik fragt für Team-Mitgliedschaft `initiatorId UNION invitees.team='initiator'`.

### `FriendlyResult`

```typescript
export const friendlyResult = sqliteTable('friendly_result', {
  id: integer('id').primaryKey({ autoIncrement: true }).$type<FriendlyResultId>(),
  friendlyId: integer('friendly_id').notNull().unique()
    .references(() => friendly.id, { onDelete: 'cascade' }).$type<FriendlyId>(),

  // Sieger-Team — bei singles ein Member, bei doubles zwei
  // (gespeichert als JSON-Array, weil bis zu zwei IDs)
  winnerMemberIds: text('winner_member_ids', { mode: 'json' })
    .$type<MemberId[]>().notNull(),

  sets: text('sets', { mode: 'json' }).$type<SetScore[]>().notNull(),
  matchMode: text('match_mode', {
    enum: ['best-of-3-tiebreak', 'best-of-3-full', 'best-of-3-champions',
           'short-sets-tiebreak', 'pro-set'],
  }).notNull(),

  reportedAt: integer('reported_at', { mode: 'timestamp' })
    .notNull().default(sql`(unixepoch())`),
  reportedBy: integer('reported_by').notNull()
    .references(() => member.id, { onDelete: 'cascade' }).$type<MemberId>(),

  confirmationStatus: text('confirmation_status', {
    enum: ['pending', 'confirmed', 'disputed'],
  }).notNull().default('pending'),
  confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
  confirmedBy: integer('confirmed_by')
    .references(() => member.id, { onDelete: 'set null' }).$type<MemberId>(),
  disputedAt: integer('disputed_at', { mode: 'timestamp' }),
  disputeNote: text('dispute_note'),
})
```

Bewusst eine **eigene** Tabelle statt MatchResult zu erweitern: andere
Lifecycle-Voraussetzungen (Doppel = mehrere Sieger-IDs), keine
`applied`/`appliedAt` (FR-94: keine Rangliste-Mutation), kein Cross-Ranking-
`MatchPointsAward`. Falls später Punkte-Tabelle für Friendlies aktiviert
wird, bekommt diese Tabelle ein `applied`-Feld nachgereicht.

### Activity-Tracking

FR-93 verlangt, dass Friendlies in die Aktivitäts-Statistik eingehen, auch
ohne Ergebnis. Statt `RankingEntry.lastMatchAt` (das Challenges schon
befüllt) kommt ein neues Feld auf `Member`:

```typescript
member.lastFriendlyAt = integer('last_friendly_at', { mode: 'timestamp' })
```

Wird gesetzt, wenn ein Friendly nach `PLAYED` oder `COMPLETED` übergeht.
Aktivitäts-Anzeige (FR-42) summiert später Challenges + Friendlies für
beide Felder.

### Migrations

- Neue Tabellen: `friendly`, `friendly_invitee`, `friendly_result`
- Schema-Änderung `member`: Spalte `last_friendly_at` (nullable)
- Eine Drizzle-Migration

## API-Endpoints

### Friendlies

| Methode | Pfad                                  | Auth     | Zweck                                       |
|---------|---------------------------------------|----------|---------------------------------------------|
| `POST`  | `/api/friendlies`                     | session  | Neues Friendly anlegen                      |
| `GET`   | `/api/friendlies`                     | session  | Eigene Friendlies (incoming + outgoing + past) |
| `GET`   | `/api/friendlies/:id`                 | session  | Detail (nur Teilnehmer)                     |
| `POST`  | `/api/friendlies/:id/accept`          | session  | Nur Eingeladener darf annehmen              |
| `POST`  | `/api/friendlies/:id/decline`         | session  | Nur Eingeladener darf ablehnen              |
| `POST`  | `/api/friendlies/:id/cancel`          | session  | Nur Initiator, in jedem Status außer COMPLETED/DISPUTED |
| `POST`  | `/api/friendlies/:id/mark-played`     | session  | Teilnehmer markiert „gespielt, kein Ergebnis" |

### Results

| Methode | Pfad                                          | Auth     | Zweck                                  |
|---------|-----------------------------------------------|----------|----------------------------------------|
| `POST`  | `/api/friendlies/:id/result`                  | session  | Sieger-Team meldet Ergebnis (FR-30)    |
| `POST`  | `/api/friendly-results/:id/confirm`           | session  | Verlierer-Team bestätigt (FR-31)       |
| `POST`  | `/api/friendly-results/:id/dispute`           | session  | Verlierer-Team widerspricht (FR-32)    |

### Zod-Schemas

```typescript
export const createFriendlyInput = z.object({
  format: z.enum(['singles', 'doubles']),
  scheduledAt: z.coerce.date().refine((d) => d.getTime() > Date.now() - 60 * 60 * 1000,
    { message: 'friendly.scheduled-in-past' }),  // Toleranz: 1h in die Vergangenheit
  courtInfo: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
  matchMode: z.enum([
    'best-of-3-tiebreak', 'best-of-3-full', 'best-of-3-champions',
    'short-sets-tiebreak', 'pro-set',
  ]),
  // Singles: genau eine opponentId. Doubles: partnerId + zwei opponentIds.
  partnerId: z.number().int().positive().optional(),
  opponentIds: z.array(z.number().int().positive()).min(1).max(2),
})
.refine((v) =>
  (v.format === 'singles' && v.partnerId === undefined && v.opponentIds.length === 1) ||
  (v.format === 'doubles' && v.partnerId !== undefined && v.opponentIds.length === 2),
  { message: 'friendly.invalid-team-shape' })

export const reportFriendlyResultInput = z.object({
  // IDs der Sieger — singles: 1 ID, doubles: 2 IDs aus demselben Team
  winnerMemberIds: z.array(z.number().int().positive()).min(1).max(2),
  sets: z.array(setScore).min(1).max(5),  // gleiches setScore wie challenges
  // matchMode aus Friendly übernommen, kein Override hier
})
```

### Fehler-Codes

| Code                              | HTTP | Bedeutung                                                  |
|-----------------------------------|------|------------------------------------------------------------|
| `friendly.not-found`              | 404  |                                                            |
| `friendly.not-participant`        | 403  | Aufrufer ist weder Initiator noch Eingeladener             |
| `friendly.invalid-transition`     | 409  | z. B. accept auf bereits cancelled                         |
| `friendly.invalid-team-shape`     | 400  | Singles mit Partner, Doubles ohne Partner, etc.            |
| `friendly.duplicate-member`       | 400  | Spieler kommt mehrfach im Team-Setup vor                   |
| `friendly.scheduled-in-past`      | 400  | Termin liegt zu weit in der Vergangenheit                  |
| `friendly.target-pausiert`        | 409  | Eingeladener ist pausiert                                  |
| `friendly.invalid-set-shape`      | 400  | Sätze passen nicht zum Match-Modus                         |
| `friendly.not-winner`             | 403  | Reporter ist nicht im Sieger-Team                          |
| `friendly.not-loser`              | 403  | Bestätigung nur durch Verlierer-Team                       |
| `friendly.already-confirmed`      | 409  | Ergebnis ist bereits bestätigt — unveränderlich (FR-35)    |

## Cross-Modul-Aufrufe

| Aufrufer       | Aufgerufen      | Service-Funktion                          | Zweck                                       |
|----------------|-----------------|-------------------------------------------|---------------------------------------------|
| `friendlies`   | `members`       | `findById`, `getPreferences`              | Existenz, Pausiert-Check, Präferenz-Warnung |
| `friendlies`   | `seasons`       | `getActiveSeasonAgeGroupOf(member)`       | Default-Modus pro Altersgruppe ableiten     |
| `friendlies`   | `notifications` | direkt-Brevo (notif-Modul existiert noch nicht) | Email an Eingeladene und bei Status-Änderungen |
| `friendlies`   | `members`       | `setLastFriendlyAt`                       | Aktivitäts-Stempel beim PLAYED/COMPLETED    |

`friendlies` exportiert in `index.ts`:
- `friendliesService.findById`, `friendliesService.listForMember`
- `friendlyResultsService.findByFriendly`

`members` bekommt eine neue Funktion `setLastFriendlyAt(memberIds, at)` für
das Activity-Tracking.

## Cron-Jobs

| Job                              | Frequenz   | Modul       | Zweck                                              |
|----------------------------------|------------|-------------|----------------------------------------------------|
| `auto-dispute-friendly-results`  | täglich    | friendlies  | pending FriendlyResult → disputed nach 3 Tagen     |

Bewusst **kein** Auto-Markierung als `PLAYED`/`CANCELLED` nach abgelaufenem
Termin. Ohne aktiven Eingriff bleiben CONFIRMED-Friendlies stehen, bis
Teilnehmer entweder Ergebnis melden oder „nur gespielt" markieren. Vermeidet
Edge-Cases bei verschobenen Spielen und reduziert Cron-Komplexität.

## UI-Skizze

### `/friendlies` — Inbox / Outbox

```
┌────────────────────────────────────────────┐
│  Freundschaftsspiele                       │
│  [Eingehend (1)] [Ausgehend (2)] [Vergangen]│
│                                            │
│  📥 Eingehend                              │
│  Max lädt dich ein                         │
│    Einzel · Mi 19. Mai 19:00 · Platz 3     │
│    [Annehmen] [Ablehnen]                   │
│                                            │
│  📤 Ausgehend                              │
│  Doppel mit Tom (du+Tom vs Klaus+Tim)      │
│    Sa 22. Mai 10:00 · Halle                │
│    Status: Klaus hat angenommen, Tim offen │
│    [Absagen]                               │
│                                            │
│  ✅ Vergangen                              │
│  Einzel vs Lisa · Mi · 6:4 3:6 10:7        │
└────────────────────────────────────────────┘
```

### `/friendlies/new` — Anlage-Formular

```
┌────────────────────────────────────────────┐
│  Freundschaftsspiel anbieten               │
│                                            │
│  Format:    ◉ Einzel   ○ Doppel            │
│                                            │
│  [Partner suchen...]   ← nur bei Doppel    │
│  Gegner:                                    │
│    [Spieler 1 suchen...]                   │
│    [Spieler 2 suchen...] ← nur bei Doppel  │
│                                            │
│  Termin:    [Datum] [Uhrzeit]              │
│  Platz:     [Platz 3 / Halle 1 ...]        │
│  Modus:     [Best-of-3 mit Champions-TB ▾] │
│  Notiz:     [optional, max 500 Zeichen]    │
│                                            │
│  ⚠ Spieler 2 hat „Doppel" nicht in den     │
│    Präferenzen — sie können trotzdem       │
│    eingeladen werden.                       │
│                                            │
│  [Einladen]                                │
└────────────────────────────────────────────┘
```

Spieler-Auswahl ist ein Autocomplete-Combobox (gleiches Pattern wie spätere
Suche). Filtert auf nicht-pausiert, nicht-Initiator, nicht-Doppel-bereits-
gewählt.

### `/friendlies/[id]` — Detail

Zeigt Termin, Teilnehmer (mit ihrem Annahme-Status), Notiz, Aktion-Buttons.
- `PROPOSED` für Eingeladene: `[Annehmen] [Ablehnen]`
- `PROPOSED` für Initiator: `[Absagen]`
- `CONFIRMED` für jeden: `[Ergebnis melden]` `[Nur gespielt, kein Ergebnis]` `[Absagen]` (Initiator)
- `PLAYED`: weiterhin `[Ergebnis nachmelden]`
- Pending FriendlyResult für Verlierer-Team: `[Bestätigen] [Widersprechen]`

### Profil-Seite anderer Mitglieder

Neuer Button neben „Herausfordern": `[Freundschaftsspiel anbieten]`,
springt nach `/friendlies/new?opponentId=<id>`.

### Mobile-First

Cards stapeln sich vertikal, Action-Buttons sind voll-breit auf < 640px.
Termin-Picker nutzt native HTML5-Inputs (`type="datetime-local"`).

### Sichtbarkeit

Match-bezogene Kontaktdaten (Telefon, Email, FR-7) werden für Eingeladene
sichtbar, sobald sie das Friendly **angenommen** haben — gleiche Logik wie
bei Challenges, in der Member-Sicht-Funktion zentralisiert.

## Validierung und Edge-Cases

Reihenfolge der Checks im Service `friendliesService.create`:

1. Initiator nicht in `opponentIds` und nicht `partnerId` (FR: `same-member`)
2. Format/Team-Shape laut Zod-Refine
3. `partnerId` und alle `opponentIds` sind unterschiedliche Mitglieder (`duplicate-member`)
4. Alle Eingeladenen existieren und sind nicht pausiert (`target-pausiert`)
5. Termin nicht zu weit in der Vergangenheit (Zod)
6. Match-Modus ist gültig (Zod)
7. Soft-Warning, falls Eingeladene Format-Präferenz nicht aktiv haben — kein Block

Edge-Cases:
- Eingeladener nimmt an, dann sagt Initiator ab → Status `CANCELLED`,
  alle bekommen Email
- Doppel: Partner nimmt an, ein Gegner lehnt ab → Status `DECLINED`
  (egal welches Team, einer reicht). Initiator kann ein neues Friendly mit
  Ersatz-Spieler anlegen.
- Friendly mit Termin in 5 Minuten und alle haben angenommen → CONFIRMED
  korrekt, kein Sonderweg
- Ergebnis melden für ein noch `PROPOSED` Friendly: 409
  `friendly.invalid-transition` (erst CONFIRMED oder PLAYED zulassen)
- Verlierer-Team bestätigt: jeder aus dem Verlierer-Team darf — first wins,
  speichert in `confirmedBy`. Zweiter Confirm fällt mit `already-confirmed`
- Zwei parallele Friendlies derselben Person zur selben Zeit — keine
  Block-Validierung in v1, nur informativer Hinweis im Frontend

Rate-Limit (analog FR-110):
- Max. 5 neue Friendlies pro Initiator pro Tag (höher als Challenges, weil
  Vernetzung die Idee ist) — `friendly.too-many-today`

## Tests

- **Unit (`friendliesService`)**: Validation-Cases (Self-Invite, doppelte Spieler,
  Team-Shape, Pausiert), Lifecycle-Transitionen pro Status
- **Unit (`friendlyResultsService`)**: Sets pro Modus, Confirm/Dispute,
  Idempotency (doppelter Confirm fehlschlagen)
- **Integration**: kompletter Flow Singles Create → Accept → Result → Confirm
- **Integration**: Doubles 4-Spieler-Flow (alle 3 müssen zustimmen)
- **Integration**: PLAYED-Pfad ohne Ergebnis (Activity-Stempel landet auf
  Member)
- **Integration**: Cancel-Pfade (Initiator vor / nach Confirmed)
- **Aktivitäts-Tracking**: `member.lastFriendlyAt` wird bei PLAYED und
  COMPLETED gesetzt

## Offene Fragen

- **Punkte-Tabelle-Modus**: N-01 sieht 2/1 Punkte für Friendlies mit Ergebnis,
  1 je Teilnehmer ohne Ergebnis vor — aber welcher Rangliste werden die
  Punkte gutgeschrieben, wenn ein Doppel-Friendly Spieler aus
  unterschiedlichen Altersgruppen mischt? **Vorerst keine Punkte-Vergabe**;
  vor dem Iteration-Schritt klären.
- **Doppel-Confirmation**: First-wins ist einfach, aber ein Verlierer-Team-
  Mitglied könnte ohne Wissen des anderen bestätigen. Akzeptabel für v1?
- **Mixed-/Altersklassen-Match-Erkennung**: brauchen wir die für die Statistik
  schon jetzt, oder erst mit Aktivitäts-Reports?
- **Termin-Konflikt-Warnung**: hilfreich oder nervig? Vorschlag: zunächst
  weglassen, im Betrieb beobachten.
- **Dispute-UI**: heute landen Streitfälle in DISPUTED ohne Resolve-UI
  (FR-54 ist Trainer-Feature, noch nicht da). Konsistent mit
  `challenges-results`, dort genauso vertagt.

## Abhängigkeiten zu anderen Features

- Keine harten Vor-Abhängigkeiten — `members`, `seasons`, `rankings`, `auth`
  sind alle vorhanden
- Profitiert später von einem dedizierten `notifications`-Modul; bis dahin
  werden Mails inline via `shared/email.ts` versendet (gleiches Muster wie
  `challenges-results`)
- Activity-Reports (FR-42) und Trainer-Aktivitäts-Übersicht (FR-50c)
  nutzen `member.lastFriendlyAt` — werden aber separat gebaut

## Out of Scope für diesen Schritt

- FR-95 Offene Such-Posts — eigenes Sub-Feature `friendly-search`
- FR-96 Trainer initiiert für Jugend-Spieler — Eltern-Kind-Abhängigkeit
- FR-34 Walk-over-Endpoint
- N-01 Punkte-Tabelle-Auswirkung
- FR-43 / FR-53 Trainer-Match-Empfehlungen
- Doppel-Mixed-Filter und Altersklassen-Filter beim Spieler-Auswahl
- Termin-Konflikt-Warnung
- Cron-basierte automatische Markierung als `PLAYED` nach Termin-Ablauf
