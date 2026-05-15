# Feature-Design-Doc: `challenges-results`

**Status**: entwurf
**Datum**: 2026-05-15
**Module**: [`challenges`](../../architecture/overview.md#1-modul-schnitt), [`results`](../../architecture/overview.md#1-modul-schnitt)

## Ziel

Spieler können andere herausfordern, das Match planen, das Ergebnis melden
und bestätigen. Bestätigte Ergebnisse mutieren die Rangliste gemäß dem
Wertungsmodus aus ADR-006.

Damit ist die App **funktional komplett im Kern-Pfad**: Login → Rangliste →
Herausfordern → annehmen → Ergebnis → Rangliste verändert sich.

Wir bündeln `challenges` und `results` in einem PR, weil sie ohne einander
nichts wert sind.

## Spec-Bezug

| FR-ID  | Kurzbeschreibung                                       | Abgedeckt durch                                |
|--------|--------------------------------------------------------|------------------------------------------------|
| FR-20  | Spieler kann andere aus eigener Rangliste fordern      | `POST /api/challenges`                          |
| FR-20a | Challenge in genau einer Rangliste                     | `Challenge.rankingId`                           |
| FR-20b | Match-Ergebnis bewegt Position in gewählter Rangliste  | `Strategy.applyResult`                          |
| FR-20c | Match zählt für Aktivitäts-Statistiken in allen Ranglisten | `lastMatchAt` für alle gemeinsamen RankingEntries |
| FR-20d | Cooldown ist spieler-bezogen, ranglisten-übergreifend  | Cooldown-Check über alle Member-Paarungen       |
| FR-21  | Challenge-Modell schränkt zulässige Gegner ein         | `Strategy.validateChallenge`                    |
| FR-22  | Herausgeforderter erhält Benachrichtigung              | Email beim Erstellen                            |
| FR-23  | Ablehnung mit Grund                                    | `decline` mit `reason`-Enum                     |
| FR-24  | Annahmefrist 7 Tage, Auto-Ablauf                       | Cron `expire-proposed-challenges`               |
| FR-25  | Spielfrist 21 Tage nach Annahme                        | Cron `expire-accepted-challenges` (Default-Action: COMPLETED ohne Ergebnis → DISPUTED) |
| FR-25a | Wer bucht den Platz — Standardregel Herausforderer     | Info-Feld auf Challenge                         |
| FR-26  | Cooldown 14 Tage gegen denselben Gegner                | Validation beim `create`                        |
| FR-27  | Max. 2 aktive Challenges pro Spieler (1+1)             | Validation beim `create`                        |
| FR-30  | Sieger meldet Ergebnis mit Sätzen                      | `POST /api/challenges/:id/results`              |
| FR-30a | Champions-Tiebreak als `10:x`                          | Zod-Schema für Sätze                            |
| FR-30b | Match-Modi konfigurierbar                              | Modus aus `Ranking.config.matchMode` (Default)  |
| FR-30c | Default-Modus pro Altersgruppe                         | aus Season.config oder Default                  |
| FR-30e | Validierung passt sich dem Modus an                    | Zod-Schemas pro Modus                            |
| FR-31  | Verlierer bestätigt oder widerspricht                  | `POST /api/match-results/:id/confirm` und `/dispute` |
| FR-32  | Bei Widerspruch / fehlender Reaktion 3 Tage: Streitfall| Status DISPUTED, Cron `auto-dispute-after-3d`   |
| FR-33  | Bestätigte Ergebnisse aktualisieren Rangliste sofort   | `applyResult` im selben Transaction-Schritt     |
| FR-35  | Bestätigte Ergebnisse unveränderlich                   | DB-Constraint, Admin-Korrektur via Audit-Eintrag (out of scope) |
| FR-110 | Max. 3 neue Challenges pro Spieler pro Tag             | RateLimit-Service                                |
| FR-111 | Max. 2 aktive Challenges gleichzeitig                  | Validation                                       |
| N-01   | Spielpunkte je Match-Ausgang (Punkte-Tabelle-Modus)    | `MatchPointsAward`-Tabelle + Strategy            |

**Nicht abgedeckt** (verschoben):

- FR-20a-i (Gegen-Vorschlag andere Rangliste) — eigene Iteration
- FR-30d (Match-Modus einvernehmlich ändern bei Annahme) — Modus aus Rangliste, kein Override
- FR-34 (Walk-over: Nicht-Erscheinen melden) — über `dispute` mit Grund initial, eigener Endpoint später
- FR-54 (Trainer/Admin entscheidet Streitfall) — Streitfall bleibt im Status DISPUTED, kein Resolve-UI
- FR-63 (Admin-Korrektur bestätigter Ergebnisse) — `admin`-Feature
- Diversitäts-Bonus (N-01) bei neuen Paarungen — vereinfacht: kein Bonus initial
- FR-25b–f (Auto-Pause) — eigenes Feature
- Freundschaftsspiele — eigenes Feature

## Datenmodell

### `Challenge`

```typescript
export const challenge = sqliteTable('challenge', {
  id: integer('id').primaryKey({ autoIncrement: true }).$type<ChallengeId>(),
  challengerId: integer('challenger_id').notNull()
    .references(() => member.id, { onDelete: 'cascade' }).$type<MemberId>(),
  challengedId: integer('challenged_id').notNull()
    .references(() => member.id, { onDelete: 'cascade' }).$type<MemberId>(),
  rankingId: integer('ranking_id').notNull()
    .references(() => ranking.id, { onDelete: 'cascade' }).$type<RankingId>(),
  status: text('status', {
    enum: ['PROPOSED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'COMPLETED', 'DISPUTED'],
  }).notNull().default('PROPOSED'),

  // Lifecycle-Zeitstempel — null bis der Status erreicht ist
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull().default(sql`(unixepoch())`),
  acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
  declinedAt: integer('declined_at', { mode: 'timestamp' }),
  expiredAt: integer('expired_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  disputedAt: integer('disputed_at', { mode: 'timestamp' }),

  declineReason: text('decline_reason', {
    enum: ['injury', 'vacation', 'work', 'other'],
  }),
  declineNote: text('decline_note'),
})
```

Index: `(challengerId, status)`, `(challengedId, status)` für Inbox-Abfragen.

### `MatchResult`

```typescript
export const matchResult = sqliteTable('match_result', {
  id: integer('id').primaryKey({ autoIncrement: true }).$type<MatchResultId>(),
  challengeId: integer('challenge_id').notNull().unique()
    .references(() => challenge.id, { onDelete: 'cascade' }).$type<ChallengeId>(),

  winnerId: integer('winner_id').notNull()
    .references(() => member.id, { onDelete: 'cascade' }).$type<MemberId>(),
  // Sätze als JSON-Array, z. B. [{a:6, b:4}, {a:3, b:6}, {a:10, b:7}]
  // Erster Satz = Sieger zuerst (a > b im ersten Satz nicht zwingend, weil
  // erster Satz auch verloren sein kann)
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
  disputedAt: integer('disputed_at', { mode: 'timestamp' }),
  disputeNote: text('dispute_note'),

  // Wurde das Ergebnis auf die Rangliste angewendet?
  applied: integer('applied', { mode: 'boolean' }).notNull().default(false),
  appliedAt: integer('applied_at', { mode: 'timestamp' }),
})

export type SetScore = { a: number; b: number }
```

### `MatchPointsAward` (für N-01)

```typescript
export const matchPointsAward = sqliteTable('match_points_award', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  matchResultId: integer('match_result_id').notNull()
    .references(() => matchResult.id, { onDelete: 'cascade' }),
  rankingEntryId: integer('ranking_entry_id').notNull()
    .references(() => rankingEntry.id, { onDelete: 'cascade' }),
  memberId: integer('member_id').notNull()
    .references(() => member.id, { onDelete: 'cascade' }).$type<MemberId>(),
  points: integer('points').notNull(),
  reason: text('reason', {
    enum: ['challenge-win', 'challenge-loss', 'walkover-win'],
  }).notNull(),
  awardedAt: integer('awarded_at', { mode: 'timestamp' })
    .notNull().default(sql`(unixepoch())`),
})
```

## Strategy-Erweiterung

Das `RankingStrategy`-Interface bekommt zwei neue Methoden:

```typescript
export interface RankingStrategy {
  // ... existing methods

  /**
   * Darf der Challenger den Challenged in dieser Rangliste fordern?
   * Bekommt die aktuellen Positions-Entries als Snapshot.
   */
  validateChallenge: (input: ValidateChallengeInput) => ValidationResult

  /**
   * Wendet ein bestätigtes Match-Ergebnis an.
   * Liefert die Mutationen, die der Service in einer Transaktion persistiert.
   */
  applyResult: (input: ApplyResultInput) => RankingMutation[]
}

type ValidateChallengeInput = {
  challengerEntry: RankingEntry
  challengedEntry: RankingEntry
  config: RankingConfig
}

type ValidationResult = { ok: true } | { ok: false; reason: string }

type ApplyResultInput = {
  winnerId: MemberId
  loserId: MemberId
  challengerEntry: RankingEntry
  challengedEntry: RankingEntry
  allEntries: RankingEntry[]
  config: RankingConfig
}

type RankingMutation =
  | { kind: 'set-position'; entryId: RankingEntryId; position: number }
  | { kind: 'set-points'; entryId: RankingEntryId; points: number }
  | { kind: 'set-elo'; entryId: RankingEntryId; eloRating: number }
  | { kind: 'set-last-match'; entryId: RankingEntryId; at: Date }
  | { kind: 'award-points'; memberId: MemberId; rankingEntryId: RankingEntryId; points: number; reason: PointsAwardReason }
```

### Pro Modus

**Pyramide (`pyramid`)**:
- `validateChallenge`: Challenger-Position > Challenged-Position (Challenger ist niedriger gerankt), Distanz ≤ `maxJumpUp`
- `applyResult`:
  - Sieger ist Challenger: Challenger nimmt Challenged-Position ein, alle dazwischen rutschen einen Platz nach unten
  - Sieger ist Challenged: keine Positions-Änderung
  - Beide bekommen `lastMatchAt` aktualisiert

**ELO (`elo`)**:
- `validateChallenge`: kein Limit, immer `ok`
- `applyResult`: ELO-Formel mit `kFactor` aus config, neue Ratings für beide, Positionen werden aus den neuen Ratings sortiert (alle Einträge müssen neu sortiert werden)

**Hybrid (`hybrid`)**:
- `validateChallenge`: Sprung-Distanz wie Pyramide
- `applyResult`: Positions-Tausch wie Pyramide + ELO-Update wie ELO

**Punkte-Tabelle (`points-table`)**:
- `validateChallenge`: kein Limit, immer `ok`
- `applyResult`: Punkte gemäß `config.pointValues` an Sieger und Verlierer, Positionen aus aufsteigender Punkte-Sortierung neu vergeben

## Cross-Modul-Aufrufe (neu)

| Aufrufer        | Aufgerufen     | Service-Funktion                                | Zweck                              |
|-----------------|----------------|-------------------------------------------------|------------------------------------|
| `challenges`    | `members`      | `findById`                                       | Existenz, Block-Prüfung, Pausiert  |
| `challenges`    | `rankings`     | `getRankingEntries`, `getRankingMode`            | Sprung-Regel-Validierung           |
| `challenges`    | `notifications`| direkt-Brevo (notif-Modul existiert noch nicht)  | Email an Challenged                |
| `results`       | `challenges`   | `markChallengeCompleted`                         | Status-Transition nach Confirm     |
| `results`       | `rankings`     | `applyMutations`                                 | Persist der Strategy-Mutationen    |
| `results`       | `notifications`| direkt-Brevo                                     | Email an Verlierer / Ergebnis      |

`rankings` bekommt neue Public-API-Funktionen:
- `getRankingEntries(rankingId)` — Snapshot für Strategy-Calls
- `applyMutations(rankingId, mutations[])` — Atomic-Anwendung in einer Transaktion

## API-Endpoints

### Challenges

| Methode | Pfad                                  | Auth     | Zweck                                       |
|---------|---------------------------------------|----------|---------------------------------------------|
| `POST`  | `/api/challenges`                     | session  | Neue Challenge anlegen                      |
| `GET`   | `/api/challenges`                     | session  | Eigene Challenges (incoming + outgoing)     |
| `GET`   | `/api/challenges/:id`                 | session  | Detail (nur Teilnehmer + Admin/Trainer)     |
| `POST`  | `/api/challenges/:id/accept`          | session  | Nur Challenged darf annehmen                |
| `POST`  | `/api/challenges/:id/decline`         | session  | Nur Challenged darf ablehnen, mit Grund     |

### Results

| Methode | Pfad                                          | Auth     | Zweck                                  |
|---------|-----------------------------------------------|----------|----------------------------------------|
| `POST`  | `/api/challenges/:id/result`                  | session  | Sieger meldet Ergebnis (FR-30)         |
| `POST`  | `/api/match-results/:id/confirm`              | session  | Verlierer bestätigt (FR-31)            |
| `POST`  | `/api/match-results/:id/dispute`              | session  | Verlierer widerspricht (FR-32)         |

### Zod-Schemas

```typescript
export const createChallengeInput = z.object({
  challengedId: z.number().int().positive(),
  rankingId: z.number().int().positive(),
})

export const declineChallengeInput = z.object({
  reason: z.enum(['injury', 'vacation', 'work', 'other']),
  note: z.string().max(500).optional(),
})

const setScore = z.object({
  a: z.number().int().min(0).max(20),
  b: z.number().int().min(0).max(20),
})

export const reportResultInput = z.object({
  winnerId: z.number().int().positive(),
  sets: z.array(setScore).min(1).max(5),
  matchMode: z.enum([
    'best-of-3-tiebreak', 'best-of-3-full', 'best-of-3-champions',
    'short-sets-tiebreak', 'pro-set',
  ]).optional(), // Default aus Ranking.config
})

export const disputeResultInput = z.object({
  note: z.string().max(1000),
})
```

Match-Mode-spezifische Validation (z. B. `best-of-3-tiebreak` braucht
genau 2 Sätze plus Tiebreak, `pro-set` genau 1 Satz) erfolgt im Service
nach dem Basis-Parsing.

### Fehler-Codes

| Code                            | HTTP | Bedeutung                                                  |
|---------------------------------|------|------------------------------------------------------------|
| `challenge.not-found`           | 404  |                                                            |
| `challenge.not-participant`     | 403  | Aufrufer ist weder Challenger noch Challenged              |
| `challenge.invalid-transition`  | 409  | z. B. accept auf bereits accepted                          |
| `challenge.target-pausiert`     | 409  | Challenged ist pausiert (FR-25c)                           |
| `challenge.cooldown-active`     | 429  | Cooldown gegen denselben Gegner (FR-26)                    |
| `challenge.too-many-active`     | 429  | Limit aus FR-27                                            |
| `challenge.too-many-today`      | 429  | Limit aus FR-110                                           |
| `challenge.jump-not-allowed`    | 409  | Sprung-Regel verletzt (Pyramide/Hybrid)                    |
| `challenge.same-member`         | 400  | Spieler fordert sich selbst                                |
| `challenge.not-in-ranking`      | 409  | Challenger oder Challenged nicht in der Rangliste          |
| `result.not-winner-or-loser`    | 403  | Reporter ist nicht Sieger oder Verlierer                   |
| `result.not-loser`              | 403  | Bestätigung nur durch Verlierer                            |
| `result.already-confirmed`      | 409  | Ergebnis ist bereits bestätigt — unveränderlich (FR-35)    |
| `result.invalid-sets-for-mode`  | 400  | Sätze passen nicht zum Match-Modus                         |

## Cron-Jobs

| Job                            | Frequenz   | Modul       | Zweck                                              |
|--------------------------------|------------|-------------|----------------------------------------------------|
| `expire-proposed-challenges`   | stündlich  | challenges  | PROPOSED → EXPIRED nach 7 Tagen ohne Reaktion      |
| `expire-accepted-challenges`   | täglich    | challenges  | ACCEPTED → DISPUTED nach 21 Tagen ohne Ergebnis    |
| `auto-dispute-pending-results` | täglich    | results     | pending MatchResult → disputed nach 3 Tagen        |

## UI

### Rangliste-Detail — „Herausfordern"-Button

In `/ranglisten/[id]` bekommt jede Zeile (außer eigene) einen Button:

```
┌──────────────────────────────────────────────────┐
│ #3   Max Müller        LK 8.3        [Fordern]   │
│ #4   Tim Schmidt       LK 9.1                    │  ← du
│ #5   Klaus Berger      LK 9.5        [Fordern]   │
└──────────────────────────────────────────────────┘
```

Button-Disabled-Cases:
- eigene Zeile
- Modus blockiert (Sprung-Distanz zu hoch in Pyramide)
- pausierter Spieler (FR-25c)
- Cooldown aktiv
- eigener aktiver Challenge-Slot voll

Hover-Tooltip erklärt jeweils, warum disabled.

### `/challenges` — Inbox / Outbox

```
┌────────────────────────────────────────┐
│  Challenges                            │
│  [Eingehend (2)] [Ausgehend (1)]       │
│                                        │
│  📥 Eingehend                          │
│  Max Müller fordert dich               │
│    Aktive Herren · noch 5 Tage         │
│    [Annehmen] [Ablehnen]               │
│                                        │
│  📤 Ausgehend                          │
│  Klaus Berger                          │
│    Aktive Herren · wartet auf Antwort  │
│                                        │
│  ✅ Abgeschlossen (zuletzt)            │
│  vs Tim Schmidt · 6:4 3:6 10:7         │
└────────────────────────────────────────┘
```

### `/challenges/[id]` — Detail

Zeigt Status, Teilnehmer, Rangliste, Aktion-Buttons. Bei ACCEPTED erscheint
„Ergebnis melden" für den Sieger; bei pending Result erscheint
„Bestätigen / Widersprechen" für den Verlierer.

### Ergebnis-Erfassung

Mode-spezifisch — bei `best-of-3-tiebreak` z. B. zwei Satz-Inputs + Tiebreak:

```
┌────────────────────────────────────────┐
│  Ergebnis melden                       │
│                                        │
│  Sieger: ◉ Max  ○ Klaus                │
│                                        │
│  Satz 1:  [6] : [4]                    │
│  Satz 2:  [3] : [6]                    │
│  Tiebreak: [10] : [7]                  │
│                                        │
│  [Melden]                              │
└────────────────────────────────────────┘
```

## Email-Templates

Neue Templates im `auth/service/email.ts` oder besser ein eigenes
`shared/email.ts` für allgemeine Mails — vor dem eigentlichen
`notifications`-Modul:

- **„Du wurdest gefordert"** an Challenged bei Create
- **„Deine Challenge wurde angenommen"** an Challenger bei Accept
- **„Deine Challenge wurde abgelehnt"** an Challenger bei Decline (mit Grund)
- **„Ergebnis muss bestätigt werden"** an Verlierer bei Result-Report
- **„Ergebnis bestätigt — Position aktualisiert"** an beide bei Confirm

Dev-Stub bleibt: Console-Log mit Link, wenn kein Brevo-Key.

## Validierung beim `create`

Reihenfolge der Checks im Service:

1. Challenger != Challenged (FR: `same-member`)
2. Ranking ist `ACTIVE` (über Season-Status)
3. Beide in der Rangliste? (`not-in-ranking`)
4. Beide nicht pausiert? (`target-pausiert` für Challenged; eigener Status nicht relevant — eigene Wahl)
5. Block-Status (FR-116) — out of scope ohne `member-blocks`-Feature, später nachziehen
6. Rate-Limit FR-110: max 3 neue pro Tag (`too-many-today`)
7. Limit FR-27: max 2 aktive (1+1) (`too-many-active`)
8. Cooldown FR-26: 14 Tage gegen denselben Gegner über *alle* gemeinsamen Ranglisten (`cooldown-active`)
9. Strategy.validateChallenge — Sprung-Regel (`jump-not-allowed`)

## Apply-Result-Flow

```
POST /api/match-results/:id/confirm
  ├─ Validate: Aufrufer ist Verlierer, Status ist 'pending'
  ├─ Transaction begin
  │  ├─ MatchResult.confirmationStatus = 'confirmed', confirmedAt = now
  │  ├─ Strategy.applyResult(...) → mutations[]
  │  ├─ Persist mutations (set-position, set-points, set-elo, set-last-match)
  │  ├─ Persist MatchPointsAwards (für N-01-Modus)
  │  ├─ Challenge.status = 'COMPLETED', completedAt = now
  │  └─ MatchResult.applied = true, appliedAt = now
  └─ Transaction commit
  └─ Email an beide
```

Bei Pyramide: Positions-Tausch (Challenger nimmt Challenged-Position, alle
dazwischen rutschen einen Platz nach unten). Bei Points-Tabelle: Punkte
addieren, alle Einträge im selben Ranking nach neuer Punkte-Sortierung
re-positionieren.

## Tests

- **Strategy**: validateChallenge + applyResult pro Modus, je mehrere
  Szenarien (Sieger oben/unten, Sprung erlaubt/nicht, Cooldown)
- **Challenge-Service**: alle Validation-Cases (Cooldown, Limits,
  Pausiert, Same-Member, Jump)
- **Result-Service**: Sets pro Modus, Confirm-Flow, Dispute-Flow,
  Idempotency (doppelter Confirm muss fehlschlagen)
- **Integration**: kompletter Flow Create → Accept → Result → Confirm
- **Generation-Test in `rankings`** muss weiter laufen

## Out of Scope für diesen Schritt

- FR-20a-i (Gegen-Vorschlag andere Rangliste) — neuer Endpoint später
- FR-30d (Match-Modus-Override bei Annahme) — Modus aus Rangliste
- FR-34 (Walk-over-Meldung) — über `dispute` initial, eigener Endpoint später
- FR-54 (Trainer-Resolve-UI) — Dispute bleibt offen, Admin via DB
- FR-25b–f (Auto-Pause) — eigenes Feature
- FR-116 (Block-Funktion) — eigenes Feature
- Diversitäts-Bonus N-01 (neue Paarungen → +1 Punkt) — vereinfacht: kein Bonus initial
- Freundschaftsspiele
- Match-Vorschläge

## Geklärte Punkte

- Auto-Action nach 21 Tagen ohne Ergebnis: **automatischer Übergang zu DISPUTED**, damit Trainer/Admin später entscheiden können (statt einfach EXPIRED, was die Match-Aktivität verschluckt)
- Match-Modus wird beim Create aus `Ranking.config.matchMode` gelesen (Default aus Season). Keine Override-Option durch User in diesem PR.
- Punkte-Tabelle: beim ersten Match in einer Saison werden keine Diversitäts-Boni ausgeschüttet (alle Paarungen sind „neu") — Bonus-Mechanik kommt mit dem nächsten Iteration-Schritt
- Cooldown FR-26 prüft **alle gemeinsamen Ranglisten** des Paares — nicht nur die challenge-Rangliste (FR-20d)
- Ein bestätigtes Ergebnis ist DB-seitig unveränderlich — Korrektur nur durch Admin via separater Aktion (out of scope, kommt in `admin`)
