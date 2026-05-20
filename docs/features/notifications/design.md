# Feature: Notifications — FR-70 (Email-Benachrichtigungen)

**Status:** Design · vor-Launch-Pflicht
**Spec-Referenzen:** FR-70, FR-72 (Toggles), FR-71 (Web-Push v2 — explizit out)
**Tangiert:** `members`, `challenges`, `friendlies`, `auth` (Transport-Teilung)

## Motivation

Heute verschicken `friendliesService.create()` und `challengesService.create()`
keine Mails. FR-70 verlangt aber explizit sofortige Email bei jedem
Lebenszyklus-Schritt von Challenges und Freundschaftsspielen — sonst sieht ein
Spieler eine Einladung nur, wenn er gerade in der App ist. Auf Mitglieder mit
Tagesnutzung < 1× ist das nicht zumutbar; ohne Mails ist die Plattform tot.

## Scope

### Drin
FR-70 vollständig für die heute existierenden Lifecycle-Events. Pro
Notifikationstyp ein Toggle in den Settings (FR-72). Defaults: alles an.

| Code                            | Empfänger    | Auslöser                                                                              |
| ------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| `challenge.received`            | Geforderter  | `challengesService.create`                                                            |
| `challenge.accepted`            | Forderer     | `challengesService.accept`                                                            |
| `challenge.declined`            | Forderer     | `challengesService.decline`                                                           |
| `challenge.expired`             | beide        | `challengesService.expireStaleProposed` (Cron, PROPOSED → EXPIRED nach 7 Tagen)        |
| `challenge.result_reported`     | Verlierer    | `resultsService.report`                                                               |
| `challenge.result_confirmed`    | Reporter     | `resultsService.confirm`                                                              |
| `challenge.result_disputed`     | Reporter     | `resultsService.dispute` und `resultsService.autoDisputeStale` (Cron, FR-32)          |
| `friendly.invited`              | Eingeladene  | `friendliesService.create`                                                            |
| `friendly.accepted`             | Initiator    | `friendliesService.accept`                                                            |
| `friendly.declined`             | Initiator    | `friendliesService.decline`                                                           |
| `friendly.cancelled`            | Eingeladene  | `friendliesService.cancel`                                                            |
| `friendly.result_reported`      | Verlierer-Team | `friendlyResultsService.report`                                                     |
| `friendly.result_confirmed`     | Reporter     | `friendlyResultsService.confirm`                                                      |
| `friendly.result_disputed`      | Reporter     | `friendlyResultsService.dispute` und `friendlyResultsService.autoDisputeStale` (Cron) |

### Draußen — explizit vertagt
- **FR-71 Web-Push** (PWA) — v2.
- **FR-115 Stündlicher Digest** ab 5 Mails/Stunde — sobald wir den Spam-Druck
  messen, eigener PR. Designschnitt erlaubt das additive Einbauen ohne Eingriff
  in Caller (siehe „Future").
- **FR-117 Admin-konfigurierbare Limits** — sobald die Limits selbst da sind.
- **Suggestion-Notifikation** (Trainer-Match-Empfehlung) — gehört in das
  `suggestions`-Modul, das den Trigger besitzt; wird dort nachgezogen.
- **„Ablaufende Frist" als Warn-Mail vor Expire** — die Spec ist hier doppelt
  zu lesen. Wir interpretieren FR-70 „Ablaufende Frist" als die schon
  bestehenden Expire/Auto-Dispute-Cron-Ergebnisse (`challenge.expired`,
  `*.result_disputed` über Cron). Ein zusätzlicher „Erinnerung in 24 h"-Job
  ist ein eigenes Feature.

## Architektur

### Neues Modul `server/modules/notifications`

```
server/modules/notifications/
├── index.ts                # Public API (notifyService + Types)
├── service/
│   ├── dispatcher.ts       # notifyService.dispatch(event) — Prefs-Lookup, Templating, Send
│   └── templates/
│       ├── challenge.ts    # 6× renderChallenge*
│       └── friendly.ts     # 7× renderFriendly*
└── types.ts                # NotificationEvent-Union, NotificationKey-Enum
```

Aufrufer in `challenges`/`friendlies`/`results` rufen ausschließlich
`notifyService.dispatch(event)`. Die Funktion ist `Promise<void>`,
catch-all intern, **wirft niemals an den Caller**. Begründung: ein 502 vom
Brevo-SMTP darf eine erfolgreiche DB-Mutation nicht in einen 500 verwandeln.

### Shared Email-Transport

Heute lebt der nodemailer-Transport in
[`server/modules/auth/service/email.ts`](../../../server/modules/auth/service/email.ts).
Drei Verbraucher (Magic-Link, Admin-Invite, Notifications) brauchen ihn —
also wandert er nach `server/shared/email-transport.ts`:

```ts
// server/shared/email-transport.ts
export type EmailPayload = {
  to: { email: string; firstName: string }
  subject: string
  html: string
  text: string
}
export async function sendEmail(kind: string, payload: EmailPayload, fallbackHint?: string): Promise<void>
export function escapeHtml(s: string): string
```

`auth/service/email.ts` und das neue Notifications-Modul werden zu dünnen
Template-Layern darüber. Das ist kein Notif-Modul-Aufruf auf `auth` — die
Transport-Funktion ist neutraler Infrastruktur-Code in `shared/`, kein
Modul-Cross-Call.

### Preferences-Speicherung — JSON-Spalte auf `member`

Spec § 8 listet `NotificationPreference` als eigene Entity. Wir machen es
**eine Stufe schlanker** und legen die Toggle-Map als JSON-Spalte
`notificationPrefs` auf `member` ab. Begründung:

- ein Datensatz pro Mitglied — kein N:1-Mehrwert
- Per-Channel-Granularität (`email` vs. `push`) brauchen wir erst mit FR-71
- Konsistent mit `preferences` (`MatchPreferences`), das genauso aufgebaut ist
- ADR-006 (Konkurrenz-Snapshots) zeigt: lieber JSON+Migration als Tabelle, bis
  die fachliche Komplexität wirklich relational ist

Schema:

```ts
notificationPrefs: text('notification_prefs', { mode: 'json' })
  .$type<NotificationPrefs>()
  .notNull()
  .default(DEFAULT_NOTIFICATION_PREFS)
```

`NotificationPrefs = Record<NotificationKey, boolean>` mit allen Schlüsseln aus
der Tabelle oben, Default-Map `{ all keys: true }`.

**Migration:** `0015_notification_prefs.sql` — ALTER TABLE add column mit
hardgecodetem JSON-Default für Bestandsmitglieder.

### Dispatcher-Pipeline

```
dispatch(event)
  │
  ├─ resolve recipients (Array<{ memberId, email, firstName }>)
  ├─ filter: deactivated? → skip
  ├─ filter: notificationPrefs[event.key] === false → skip
  ├─ render template (subject, html, text)
  └─ sendEmail(kind: event.key, payload, …)   ← Promise, alle Errors gelogged
```

Recipient-Resolution geschieht im Dispatcher, nicht im Caller — der Caller
übergibt nur Domain-IDs, der Dispatcher lädt Profile via `profileService.findById`.
Damit kann ein Modul, das einen Event feuert, niemals versehentlich Empfänger-
Listen falsch zusammensetzen.

### Fire-and-Forget-Semantik

```ts
// In challengesService.create:
const row = challengeRepo.insert({...})
const dto = enrichOne(row)
void notifyService.dispatch({
  key: 'challenge.received',
  challengeId: row.id,
  recipientId: row.challengedId,
}).catch((err) => console.error('notify failed', err))
return dto
```

Das `void` + `.catch` ist absichtlich — der DTO geht raus, bevor die Mail durch ist.
Im Test-Setup wird `notifyService` per Modul-Mock auf einen synchronen Recorder
umgesetzt, damit Assertions möglich sind.

### Templates

Pro Notification-Key eine Render-Funktion `(payload, ctx) → { subject, html, text }`.
HTML-Stil orientiert sich an den bestehenden Magic-Link-/Invite-Templates
(`docs/design-system.md` Token-Hexes inline, Tabellen-Layout, Source-Sans 3).

Subject-Beispiele:
- `ace · Neue Herausforderung von Anna Müller`
- `ace · Deine Forderung wurde angenommen`
- `ace · Einladung zum Doppel am Sa, 24.05.`

Alle Templates schließen mit einem Hinweis-Footer: *„Diese Benachrichtigungen
kannst du in deinem Profil deaktivieren."* — plus Link `/profile`.

## API & Datenmodell

### Endpoint
`PATCH /api/members/me` erweitert um optionales `notificationPrefs`-Feld
(partial). Validierung über Zod-Schema, das nur bekannte Keys erlaubt.

### TypeScript-Types
```ts
// In server/modules/notifications/types.ts
export const NOTIFICATION_KEYS = [
  'challenge.received', 'challenge.accepted', 'challenge.declined',
  'challenge.expired', 'challenge.result_reported', 'challenge.result_confirmed',
  'challenge.result_disputed',
  'friendly.invited', 'friendly.accepted', 'friendly.declined',
  'friendly.cancelled', 'friendly.result_reported', 'friendly.result_confirmed',
  'friendly.result_disputed',
] as const
export type NotificationKey = (typeof NOTIFICATION_KEYS)[number]
export type NotificationPrefs = Record<NotificationKey, boolean>
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = Object.fromEntries(
  NOTIFICATION_KEYS.map((k) => [k, true]),
) as NotificationPrefs

export type NotificationEvent =
  | { key: 'challenge.received'; recipientId: MemberId; challengeId: ChallengeId }
  | { key: 'challenge.accepted'; recipientId: MemberId; challengeId: ChallengeId }
  | { key: 'challenge.declined'; recipientId: MemberId; challengeId: ChallengeId; reason?: DeclineReason; note?: string }
  | { key: 'challenge.expired'; recipientId: MemberId; challengeId: ChallengeId; role: 'challenger' | 'challenged' }
  | { key: 'challenge.result_reported'; recipientId: MemberId; challengeId: ChallengeId; resultId: MatchResultId }
  | { key: 'challenge.result_confirmed'; recipientId: MemberId; challengeId: ChallengeId; resultId: MatchResultId }
  | { key: 'challenge.result_disputed'; recipientId: MemberId; challengeId: ChallengeId; resultId: MatchResultId; auto: boolean }
  | { key: 'friendly.invited'; recipientId: MemberId; friendlyId: FriendlyId }
  | { key: 'friendly.accepted'; recipientId: MemberId; friendlyId: FriendlyId; responderId: MemberId }
  | { key: 'friendly.declined'; recipientId: MemberId; friendlyId: FriendlyId; responderId: MemberId }
  | { key: 'friendly.cancelled'; recipientId: MemberId; friendlyId: FriendlyId }
  | { key: 'friendly.result_reported'; recipientId: MemberId; friendlyId: FriendlyId; resultId: FriendlyResultId }
  | { key: 'friendly.result_confirmed'; recipientId: MemberId; friendlyId: FriendlyId; resultId: FriendlyResultId }
  | { key: 'friendly.result_disputed'; recipientId: MemberId; friendlyId: FriendlyId; resultId: FriendlyResultId; auto: boolean }
```

## UI

`app/pages/profile.vue` hat heute bereits einen Section-Block für
`MatchPreferences`. Wir ergänzen einen zweiten Block „Email-Benachrichtigungen"
darunter mit den gleichen Toggle-Komponenten (`UToggle`). Gruppierung:

```
Email-Benachrichtigungen
  ┌─ Challenges ──────────────────────────────────────────┐
  │ Neue Herausforderung erhalten                  [✓]   │
  │ Antwort auf deine Forderung                    [✓]   │
  │ Ergebnis gemeldet — bitte bestätigen           [✓]   │
  │ Ergebnis bestätigt                             [✓]   │
  │ Forderung abgelaufen oder strittig             [✓]   │
  └──────────────────────────────────────────────────────┘
  ┌─ Freundschaftsspiele ─────────────────────────────────┐
  │ Einladung erhalten                             [✓]   │
  │ Antwort auf deine Einladung                    [✓]   │
  │ Einladung zurückgezogen                        [✓]   │
  │ Ergebnis gemeldet — bitte bestätigen           [✓]   │
  │ Ergebnis bestätigt                             [✓]   │
  │ Ergebnis strittig                              [✓]   │
  └──────────────────────────────────────────────────────┘
```

UI-Keys mappen auf je 1–3 NotificationKeys; das Mapping lebt im UI-Composable,
damit die Backend-Keys feiner bleiben können, ohne den Spieler mit 13
Checkboxen zu erschlagen.

## Tests

- **Unit** `tests/notifications/dispatcher.test.ts`: Pref-Filterung, Skip bei
  Deaktivierten, Skip bei fehlendem Profil; Renderer-Smoke (escaped HTML,
  Subject deutsch, Footer-Link enthalten).
- **Integration** `tests/notifications/wire.test.ts`: jeder Service-Call löst
  den richtigen Key mit den richtigen Empfängern aus. Transport per
  `vi.mock('~/server/shared/email-transport')` erfasst, Asserts gegen ein
  Recorder-Array.

Bestehende Friendly-/Challenge-Tests bleiben grün — Dispatcher ist im Test-Setup
gemockt-no-op.

## Migrations-Pfad

1. `0015_notification_prefs.sql` — ALTER TABLE member ADD COLUMN
   `notification_prefs TEXT NOT NULL DEFAULT '<all-true-json>'`
2. `server/db/schema/member.ts` um `notificationPrefs` ergänzen,
   `DEFAULT_NOTIFICATION_PREFS` exportieren
3. Code-Aufrufer: kein Touch — alle Bestandsmitglieder gelten als „alle Mails an".

## Future (nicht in diesem PR)

- **FR-115 Digest**: Dispatcher schreibt statt sofort zu senden in eine
  `notification_outbox`-Tabelle. Ein 1-h-Cron sendet stündliche Sammelmail,
  wenn mehr als 5 Items pro Empfänger.
- **FR-71 Web-Push**: Channels werden zur Map `{email: boolean, push: boolean}`,
  Dispatcher dispatcht parallel auf alle aktivierten Channels.
- **FR-117 Admin-Konfig**: Limits + Default-Prefs in `seasonConfig` o.ä. — das
  Dispatcher-Interface bleibt stabil.

Das additive Wachsen ist genau deshalb möglich, weil Caller nur
`notifyService.dispatch(event)` rufen und nichts über Transport-Wege wissen.

## Offene Fragen

- **Bouncetracking**: Brevo liefert Bounces über Webhook. Lehnen wir uns für
  v1 zurück und verlassen uns auf den Spam-Folder-Effekt? Ja — separater PR,
  sobald wir SPF/DKIM/DMARC für `tus-neureut.de` verifiziert haben.
- **Match-Empfehlung-Notif aus `suggestions`**: Trigger ist heute nicht
  vorhanden — Suggestion-Display ist passiv im Dashboard. Sobald ein
  Trainer-Push-Mechanismus existiert, ergänzen wir `suggestion.received`.
