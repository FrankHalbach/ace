# Match-State-Types: Rich Domain Model mit „make illegal states unrepresentable"

**Status**: Design — Implementierung folgt
**Datum**: 2026-05-17
**Closes**: #47 (Result vor Termin), #48 (Cancel nach Result)
**Berührte Module**: `friendlies`, `challenges`

## Problem

Die State-Machine-Logik für Friendlies und Challenges ist heute über
viele Service-Methoden verteilt (`accept`, `decline`, `cancel`,
`markPlayed`, `markCompleted`, `markDisputed`, `cancelByTrainer`,
`forceConfirm` …). Jede Methode prüft ihre eigenen Vorbedingungen.

Konsequenz: zwei Bugs der gleichen Klasse („Check vergessen") gefunden:

- **#47** — Result kann gemeldet werden, _bevor_ der Termin ist; Status
  bleibt „Bestätigt"
- **#48** — Cancel klappt, _nachdem_ der Gegner schon ein Result
  gemeldet hat; pending Result bleibt als Datenmüll zurück

Beide Bugs entstehen, weil die Service-Methoden keinen vollständigen
Blick auf den Lifecycle haben.

## Entscheidung

Pro Aggregate (Friendly, Challenge) wird **pro Lifecycle-State eine
eigene Klasse** modelliert. Jede Klasse hat ausschließlich die
Methoden, die in diesem State _erlaubt_ sind. Damit wird

```ts
// kompiliert nicht — ReportedFriendly hat kein .cancel():
reportedMatch.cancel(actor, now)
```

ein **Compile-Time-Fehler** statt eines vergessenen Runtime-Checks.

### Architektur-Layer

```
┌─ DB (Drizzle Row)
│
│  friendlyRepo.findById(id) → FriendlyRow
│  friendlyInviteeRepo.listByFriendly(id) → FriendlyInviteeRow[]
│  friendlyResultRepo.findByFriendly(id) → FriendlyResultRow | null
│
├─ Factory (Repo-Adapter)
│
│  friendlyFromRows(row, invitees, result) → FriendlyMatch (typed union)
│
├─ Domain (shared/domain/friendly/)
│
│  class ProposedFriendly  { accept, decline, cancel }
│  class AcceptedFriendly  { cancel, reportResult, markPlayed }
│  class PlayedFriendly    { reportResult }
│  class ReportedFriendly  { confirmResult, disputeResult }  // ← kein cancel
│  class CompletedFriendly { }                               // terminal
│  class DisputedFriendly  { trainerForceConfirm, trainerCancel, trainerForceCancel }
│  class CancelledFriendly { }                               // terminal
│  class DeclinedFriendly  { }                               // terminal
│
│  type FriendlyMatch = ProposedFriendly | AcceptedFriendly | ...
│
├─ Mutations
│
│  Jeder Befehl gibt ein FriendlyMutation-Diff zurück, KEINE direkte
│  DB-Schreibung im Domain. Service nimmt die Mutation und persistiert.
│
└─ Service (server/modules/friendlies/service/)

   const match = await loadFriendlyMatch(id)
   if (!(match instanceof AcceptedFriendly))
     throw new InvalidStateError(...)
   const mutation = match.cancel(actor, now)
   await applyFriendlyMutation(mutation)
```

### Zustände und Aktionen — Friendly

| State | Erlaubte Aktionen | Trainer-Aktionen |
| --- | --- | --- |
| `ProposedFriendly` | `accept` (Invitee), `decline` (Invitee), `cancel` (Initiator) | – |
| `AcceptedFriendly` (= DB-Status `CONFIRMED`) | `cancel` (Initiator), `reportResult` (Teilnehmer, falls `now ≥ scheduledAt`), `markPlayed` (Teilnehmer) | – |
| `PlayedFriendly` | `reportResult` (Teilnehmer) | – |
| `ReportedFriendly` | `confirmResult` (Verlierer-Team), `disputeResult` (Verlierer-Team) | – |
| `CompletedFriendly` | – | – |
| `DisputedFriendly` | – | `trainerForceConfirm`, `trainerCancel` |
| `CancelledFriendly` | – | – |
| `DeclinedFriendly` | – | – |

**`AcceptedFriendly` ist ein DB-Status, aber kann mehrere Sub-Zustände
darstellen**:
- Singles: ein Invitee, akzeptiert → AcceptedFriendly
- Doubles: Partner & Gegner-Team, alle akzeptiert → AcceptedFriendly;
  einer steht noch auf `pending` → bleibt `ProposedFriendly`

Das bildet die Factory intelligent ab (siehe unten).

### Wo #47 und #48 fixed werden

- **#47** (Report vor Termin) — `AcceptedFriendly.reportResult()` und
  `PlayedFriendly.reportResult()` checken `now ≥ this.scheduledAt`. Bei
  Verletzung: `BeforeScheduledError` (HTTP 409). UI prüft Compile-Time-
  konsistent via `allowedActions()`.
- **#48** (Cancel nach Report) — `ReportedFriendly` **hat keine
  `.cancel()`-Methode**. Cancel ist nur in `ProposedFriendly` und
  `AcceptedFriendly` definiert. Ein Service-Call, der versucht zu
  canceln, wenn ein Report vorliegt, schlägt am Type-Narrowing
  (`instanceof AcceptedFriendly`) fehl und gibt eine sprechende
  Fehlermeldung.

### Mutations (Daten-Diff)

Befehle geben eine `FriendlyMutation` zurück, keine direkte DB-Schreibung:

```ts
type FriendlyMutation =
  | { kind: 'accept-invitee';   inviteeId: number; at: Date }
  | { kind: 'decline-invitee';  inviteeId: number; at: Date; newStatus: 'PROPOSED' | 'DECLINED' }
  | { kind: 'transition';       to: FriendlyStatus; at: Date; field: 'cancelledAt' | 'playedAt' | ... }
  | { kind: 'report-result';    result: InsertableFriendlyResult; transitionTo?: 'PLAYED' }
  | { kind: 'confirm-result';   resultId: number; at: Date; transitionTo: 'COMPLETED' }
  | { kind: 'dispute-result';   resultId: number; at: Date; note: string; transitionTo: 'DISPUTED' }
```

Persistierung in `applyFriendlyMutation` (Service-Schicht) erfolgt in
einer Drizzle-Transaktion. Cross-Tabelle-Updates (z. B. `member.last_friendly_at`)
bleiben in der Service-Schicht — Domain hat **keine** DB-Awareness.

### Factory

```ts
export function friendlyFromRows(
  row: FriendlyRow,
  invitees: FriendlyInviteeRow[],
  result: FriendlyResultRow | null,
): FriendlyMatch {
  switch (row.status) {
    case 'PROPOSED':  return new ProposedFriendly({ row, invitees })
    case 'CONFIRMED':
      // Result ist möglicherweise schon gemeldet (pending) — dann ist
      // der semantische State 'REPORTED', auch wenn DB-Status noch
      // 'CONFIRMED' ist. Das ist ein bestehender Loose End des aktuellen
      // Modells; wir lösen es in #47 indem PLAYED-Transition beim
      // Report-Submit erfolgt. Bis dahin gilt:
      if (result && result.confirmationStatus === 'pending')
        return new ReportedFriendly({ row, invitees, result })
      return new AcceptedFriendly({ row, invitees })
    case 'PLAYED':
      if (result && result.confirmationStatus === 'pending')
        return new ReportedFriendly({ row, invitees, result })
      return new PlayedFriendly({ row, invitees })
    case 'DISPUTED':  return new DisputedFriendly({ row, invitees, result: result! })
    case 'COMPLETED': return new CompletedFriendly({ row, invitees, result: result! })
    case 'CANCELLED': return new CancelledFriendly({ row, invitees })
    case 'DECLINED':  return new DeclinedFriendly({ row, invitees })
  }
}
```

### Service-Refactor (Beispiel cancel)

**Vorher** (28 Zeilen ad-hoc-Checks):

```ts
cancel(id, memberId, now): FriendlyDetailDto {
  const row = friendlyRepo.findById(id)
  if (!row) throw new FriendlyNotFoundError(id)
  if (row.initiatorId !== memberId) throw new FriendlyNotParticipantError()
  if (row.status === 'COMPLETED' || row.status === 'DISPUTED')
    throw new FriendlyInvalidTransitionError(...)
  // ... weitere Status-Checks
}
```

**Nachher** (8 Zeilen):

```ts
cancel(id, memberId, now): FriendlyDetailDto {
  const match = loadFriendlyMatch(id)
  if (!(match instanceof ProposedFriendly) && !(match instanceof AcceptedFriendly))
    throw new InvalidStateError(`cancel: state ${match._state}`)
  const mutation = match.cancel({ memberId, isTrainer: false }, now)
  applyFriendlyMutation(mutation)
  return readDetail(id)
}
```

Die ad-hoc-Logik in der Service-Methode wird zur Klassen-Methode
verschoben, wo sie zur _Definition_ der Klasse gehört.

### allowedActions für die UI

Frontend kann pro Detail-Page wissen, was es zeigen darf. Neue API:

```
GET /api/friendlies/:id/actions → ['cancel', 'mark-played', 'report-result']
```

Im Server: laden, Aggregat erzeugen, die `actions`-Liste aus dem
Klassen-State ableiten:

```ts
function listActions(match: FriendlyMatch, actor: Actor): string[] {
  if (match instanceof ProposedFriendly) {
    const actions = []
    if (match.canAccept(actor)) actions.push('accept')
    if (match.canDecline(actor)) actions.push('decline')
    if (match.canCancel(actor)) actions.push('cancel')
    return actions
  }
  if (match instanceof AcceptedFriendly) { ... }
  // ...
}
```

Damit verschwindet die UI-Logik à la „Button zeigen, wenn Status === X
und Result nicht gesetzt" — wird vom Domain getragen.

## Schrittweises Vorgehen

Pro Aggregate ein PR, jeweils nicht-disruptiv:

1. **PR 1 — Friendly Domain-Modell** _(zuerst)_
   - `shared/domain/friendly/{states.ts, factory.ts, mutations.ts, errors.ts}`
   - Repository-Adapter: `loadFriendlyMatch`, `applyFriendlyMutation`
   - **Service-Refactor**: bestehende Methoden delegieren ans Domain,
     **API-Verhalten bleibt gleich**
   - Bug-Fixes #47 und #48 als natürliche Konsequenz
   - Tests in `tests/domain/friendly/` (pro Klasse einer)
   - `/api/friendlies/:id/actions`-Route + UI-Anpassung (folgt
     evtl. separat, wenn der Hauptpfad steht)

2. **PR 2 — Challenge Domain-Modell** _(danach)_
   - Gleiche Struktur, `ChallengeMatch`-Union
   - Schließt #48 für Challenges
   - PR-Größe vergleichbar zu PR 1

## Out of Scope

- **Match als gemeinsame Abstraktion über Friendly und Challenge** —
  beide Aggregate bleiben getrennt. Sie teilen sich nur das
  `match-scoring`-Modul. Eine Super-Klasse über beide würde mehr
  verkomplizieren als sie löst (unterschiedliche Berechtigungs-Regeln,
  unterschiedliche Outcomes auf die Rangliste).
- **Event-Sourcing** — wir bleiben bei „aktueller Status in DB, gelegentlich
  Audit-Log" (z. B. `match_points_award`). Keine Event-Streams.
- **Effekte (last_friendly_at-Update etc.) ins Domain ziehen** — bleibt
  in Service-Schicht, denn das ist Cross-Aggregate-Konsequenz.
