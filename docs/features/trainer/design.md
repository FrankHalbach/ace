# Feature-Design-Doc: `trainer`

**Status**: entwurf
**Datum**: 2026-05-15
**Modul**: [`trainer`](../../architecture/overview.md#1-modul-schnitt) (neu)

## Ziel

Trainer bekommen **einen** Bereich mit zwei Bausteinen:
1. **Streitfall-Inbox** — alle Challenges und Friendlies im Status `DISPUTED`
   in einer Liste, mit zwei Aktionen: „Bestätigen wie gemeldet" oder
   „Match abbrechen".
2. **Aktivitäts-Übersicht** — vereinsweite Tabelle aller Mitglieder mit
   letzter Match-Aktivität und Match-Anzahl der letzten 4 Wochen, sortiert
   nach „wer spielt am wenigsten".

Damit ist der Trainer-Pfeiler im Kern-Pfad funktional komplett.

## Spec-Bezug

| FR-ID  | Kurzbeschreibung                                       | Abgedeckt durch                                       |
|--------|--------------------------------------------------------|-------------------------------------------------------|
| FR-50c | Vereinsweite Aktivitäts-Übersicht                      | `GET /api/trainer/activity` + Tabelle auf `/trainer`  |
| FR-50b | Jeder Trainer kann Streitfälle entscheiden             | Trainer-Middleware, kein Owner-Check                  |
| FR-54  | Trainer entscheidet Ergebnis im Streitfall             | „Bestätigen wie gemeldet" → `forceConfirm`            |
| FR-32  | Bei Streitfall entscheidet Trainer                     | siehe oben                                            |
| FR-34  | Walk-over (Nicht-Erscheinen)                           | Über bestehenden Dispute-Pfad: Sieger meldet 6:0 6:0 → Verlierer disputed → Trainer entscheidet (`forceConfirm` oder `cancel`) |

**Nicht abgedeckt** (verschoben):

- FR-50 (Trainings­gruppen-Sicht), FR-50a (Fokus-Spieler), FR-52
  (Kategorisierung) — brauchen ein neues `training-groups`-Modul, eigenes
  Feature
- FR-51 (per-Trainings­gruppe-Report) — abhängig von FR-50
- FR-53 (manuelle Match-Empfehlungen) — überlappt mit künftigem
  `suggestions`-Feature, dort besser
- Spieler-initiiertes Cancel einer angenommenen Challenge — bewusst nicht.
  Workaround: nichts melden → 21 Tage später Auto-DISPUTE → Trainer cancelt.
  Reibung ja, aber selten genug für v1.
- Trainer-UI für Bearbeiten von Sieger oder Sätzen — bewusst nicht.
  Wenn Korrektur nötig, müssen Spieler im Workflow neu melden.

## Datenmodell

### Schema-Änderung: `challenge.status`

`CANCELLED` wird zur Enum-Liste hinzugefügt.

```typescript
status: text('status', {
  enum: ['PROPOSED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'COMPLETED', 'DISPUTED', 'CANCELLED'],
}).notNull().default('PROPOSED'),
```

`friendly.status` hat `CANCELLED` bereits.

### Cancel-Stempel

Challenge bekommt `cancelledAt: integer('cancelled_at', { mode: 'timestamp' })`
analog zu Friendly.

### Migrations

Eine Drizzle-Migration: `ALTER TABLE challenge ADD cancelled_at integer`. Der
Enum-Erweiterung selbst erfordert keine DB-Änderung (SQLite-TEXT ohne CHECK).

## API-Endpoints

| Methode | Pfad                                      | Auth           | Zweck                                          |
|---------|-------------------------------------------|----------------|------------------------------------------------|
| `GET`   | `/api/trainer/disputes`                   | trainer/admin  | Liste aller DISPUTED Challenges + Friendlies   |
| `POST`  | `/api/trainer/disputes/challenge/:id/confirm`  | trainer/admin  | Bestätigt MatchResult, Challenge → COMPLETED, Rangliste mutiert |
| `POST`  | `/api/trainer/disputes/challenge/:id/cancel`   | trainer/admin  | Challenge → CANCELLED, MatchResult bleibt disputed |
| `POST`  | `/api/trainer/disputes/friendly/:id/confirm`   | trainer/admin  | Bestätigt FriendlyResult, Friendly → COMPLETED  |
| `POST`  | `/api/trainer/disputes/friendly/:id/cancel`    | trainer/admin  | Friendly → CANCELLED                           |
| `GET`   | `/api/trainer/activity`                   | trainer/admin  | Vereinsweite Aktivitäts-Übersicht              |

### Response-Shapes

```typescript
type DisputeListItem =
  | { kind: 'challenge'; challengeId: number; rankingId: number;
      challengerId: number; challengedId: number;
      reportedWinnerId: number; reportedSets: SetScore[];
      disputeNote: string | null; disputedAt: Date }
  | { kind: 'friendly'; friendlyId: number; format: 'singles' | 'doubles';
      participants: number[]; reportedWinnerIds: number[];
      reportedSets: SetScore[]; disputeNote: string | null; disputedAt: Date }

type ActivityOverviewRow = {
  memberId: number
  firstName: string
  lastName: string
  status: 'aktiv' | 'pausiert'
  lastMatchAt: Date | null     // max(challenge-COMPLETED-applied, friendly-PLAYED, friendly-COMPLETED)
  matchesLast4Weeks: number    // Challenges (COMPLETED) + Friendlies (PLAYED/COMPLETED) der letzten 28 Tage
}
```

### Fehler-Codes

| Code                              | HTTP | Bedeutung                                                  |
|-----------------------------------|------|------------------------------------------------------------|
| `auth.role-required`              | 403  | Aufrufer ist weder trainer noch admin                      |
| `challenge.not-found`             | 404  |                                                            |
| `challenge.invalid-transition`    | 409  | Challenge nicht in DISPUTED                                |
| `friendly.not-found`              | 404  |                                                            |
| `friendly.invalid-transition`     | 409  | Friendly nicht in DISPUTED                                 |
| `result.not-found`                | 404  | Disputed Challenge ohne MatchResult — sollte nicht vorkommen, defensiv 404 |

## Cross-Modul-Aufrufe

Das `trainer`-Modul orchestriert hauptsächlich, eigener Repo-Code ist klein.
Bestehende Module bekommen jeweils eine neue Funktion:

| Modul            | Neue Service-Funktion                       | Zweck                                            |
|------------------|---------------------------------------------|--------------------------------------------------|
| `challenges`     | `cancelByTrainer(challengeId)`              | DISPUTED → CANCELLED + cancelledAt               |
| `friendlies`     | `cancelByTrainer(friendlyId)`               | DISPUTED → CANCELLED + cancelledAt               |
| `results`        | `forceConfirm(matchResultId)`               | wie `confirm`, ohne Loser-Check                  |
| `friendly-results` | `forceConfirm(friendlyResultId)`         | wie `confirm`, ohne Loser-Check                  |
| `members`        | `listAllForActivity()`                      | bestehender `listAll` ist schon ausreichend; eventuell Renaming |

Das `trainer`-Modul bekommt zusätzlich:
- `disputeListService.list()` — joint Challenges + Friendlies, beide DISPUTED
- `activityService.overview(now: Date)` — vereinsweite Aggregation

## UI-Skizze

Eine neue Page `/trainer` mit zwei Sektionen, Trainer/Admin gated.

```
┌──────────────────────────────────────────────────────────┐
│  Trainer                                                  │
├──────────────────────────────────────────────────────────┤
│  Streitfälle (3)                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Challenge #42 · Pyramide Aktive Herren             │  │
│  │ vs Lisa · gemeldet: Tom 6:4, 6:3                   │  │
│  │ Begründung: „Tom hat im 2. Satz aufgegeben"        │  │
│  │ [Bestätigen wie gemeldet]  [Match abbrechen]       │  │
│  └────────────────────────────────────────────────────┘  │
│  ...                                                      │
├──────────────────────────────────────────────────────────┤
│  Aktivitäts-Übersicht                                     │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Spieler          Status   Letzte Aktivität   4 Wochen │
│  │ Klaus Bauer      aktiv    – noch nie –       0       │
│  │ Tim Fischer      aktiv    vor 38 Tagen       0       │
│  │ Tom Weber        aktiv    vor 12 Tagen       1       │
│  │ Anna Admin       aktiv    vor 3 Tagen        2       │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

Aktivität sortiert nach `lastMatchAt` aufsteigend (NULL zuerst), damit
Inaktive oben stehen.

### UserMenu-Eintrag

Im `UserMenu` erscheint ein neuer Eintrag „Trainer-Bereich" wenn der User
die Rolle `trainer` oder `admin` hat — analog zum bestehenden
„Admin-Bereich".

## Validierung und Edge-Cases

- Challenge in DISPUTED ohne MatchResult sollte nicht vorkommen
  (Auto-Dispute setzt entweder einen pending Result auf disputed, oder
  flippt eine ACCEPTED Challenge bei 21 Tagen ohne Ergebnis direkt auf
  DISPUTED). Letzterer Fall: Challenge ist DISPUTED, aber kein
  MatchResult existiert — dann darf der Trainer **nur cancel**, nicht
  confirm. UI zeigt nur den passenden Button.
- Friendly in DISPUTED hat **immer** einen FriendlyResult (DISPUTED kommt
  nur durch `report` + `dispute` oder Auto-Dispute eines pending Results).
  Beide Buttons immer verfügbar.
- Spieler-Profile mit `lastFriendlyAt = null` und `lastMatchAt = null` →
  „noch nie gespielt", erste Position in der Inaktivitäts-Liste.
- Pausierte Spieler werden in der Aktivitäts-Übersicht **mit** angezeigt,
  aber visuell als pausiert markiert — Trainer soll wissen, wer pausiert ist.

## Tests

- **Unit `trainer.service.disputes`**: Liste enthält DISPUTED Challenges +
  Friendlies, sortiert nach `disputedAt` absteigend
- **Unit `trainer.service.activity`**: Sortierung (NULL zuerst, dann
  ältestes lastMatchAt), Match-Count innerhalb 28 Tagen korrekt
- **Integration**: Trainer confirmed disputed Challenge → COMPLETED +
  Rangliste mutiert
- **Integration**: Trainer cancelt disputed Challenge → CANCELLED, Rangliste
  unverändert
- **Integration**: Trainer cancelt disputed Challenge ohne MatchResult →
  CANCELLED (kein Result-Aufruf)
- **Integration**: Player versucht `/api/trainer/...` → 403
- **Aktivitäts-Endpoint**: liefert vernünftige Werte bei leerem System

## Offene Fragen

- **„4 Wochen" hart kodiert oder konfigurierbar?** Vorschlag: hart kodiert
  in v1, Konfiguration mit FR-120 (KPI-Konfiguration) später.
- **Aktivitäts-Endpoint Performance**: bei 500 Mitgliedern und vielen
  Matches könnte die Aggregation langsam werden. Für v1 (~12 Spieler)
  irrelevant. Optimierung mit Caching oder Materialized View, wenn nötig.
- **Mehrfach-Cancel**: was, wenn zwei Trainer parallel auf „Cancel"
  klicken? Drizzle `transition()` ist atomar (UPDATE WHERE status='DISPUTED')
  — der zweite Klick gibt 409 zurück. UI zeigt Toast „bereits abgebrochen".

## Abhängigkeiten zu anderen Features

Keine harten Vor-Abhängigkeiten. Bestehende Module
(`challenges`, `friendlies`, `results`, `friendly-results`, `members`,
`rankings`) sind alle vorhanden.

## Out of Scope für diesen Schritt

- Trainings­gruppen-Modell (FR-50, FR-50a, FR-51, FR-52)
- Trainer-Match-Empfehlungen (FR-53) — kommt mit `suggestions`
- Spieler-initiiertes Cancel von Challenges
- Walk-over als eigener Endpoint (FR-34) — der bestehende Dispute-Pfad
  reicht
- Trainer-UI für Bearbeiten von Sieger oder Sätzen
- Audit-Log der Trainer-Entscheidungen — kommt mit `admin` und FR-63
