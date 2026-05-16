# Feature-Design-Doc: `suggestions`

**Status**: entwurf
**Datum**: 2026-05-16
**Modul**: [`suggestions`](../../architecture/overview.md#1-modul-schnitt) (neu)

## Ziel

Auf der Home-Page erscheint eine Sektion „Für dich vorgeschlagen" mit
3–5 möglichen Spielpartnern. Jeder Vorschlag enthält Begründung („LK
nah", „spielt selten") und Aktions-Buttons („Challenge senden", „Friendly
anbieten"). Damit hat ein eingeloggter Spieler immer einen Anstoß, gegen
wen er als Nächstes spielen kann — der Hauptzweck der App im Alltag.

## Spec-Bezug

| FR-ID  | Kurzbeschreibung                                       | Abgedeckt durch                              |
|--------|--------------------------------------------------------|----------------------------------------------|
| FR-100 | System schlägt wöchentlich passende Gegner vor         | On-demand-Berechnung statt Cron (s. u.)      |
| FR-101 | LK-Nähe, Inaktivität, neue Paarungen, Cooldown        | `suggestionsService.suggestFor()`            |
| FR-102 | Vorschläge im Dashboard                                | Sektion auf `/` (Home-Page)                  |
| FR-104 | Vorschlag → Klick erzeugt Challenge/Friendly           | Buttons leiten auf bestehende Endpoints      |

**Nicht abgedeckt** (verschoben):

- FR-103 (Trainer-Sicht „Empfehlung versenden für Jugend") — eigene Iteration
- FR-105 (pro Spieler Frequenz konfigurierbar: aus/wöchentlich/täglich)
  — initial sind Vorschläge immer sichtbar; Toggle kommt mit Profile-
  Settings-Erweiterung
- Email-Versand der Vorschläge (FR-102 „optional wöchentliche Email") —
  kommt mit `notifications`-Modul
- Dismissal (Vorschlag wegklicken für 30 Tage) — könnte später hinzu
- „Ähnliches Aktivitäts-Muster" aus FR-101 — vage Anforderung, in v1 nicht
  modelliert; bewährter Indikator ist `lastMatchAt`-Nähe, der reicht
- „Bevorzugte Spielarten" — `MatchPreferences.singlesChallenges` etc.
  fließen v2 ein; v1 nimmt an, dass alle aktiven Spieler challengebar sind

## Datenmodell

**Keine neuen Tabellen.** Die Vorschlagsliste wird bei jedem Page-Load aus
existierenden Daten on-the-fly berechnet:

- `member` (Kandidaten, LK, Status)
- `challenge` (Cooldown-Check, „schon gespielt?")
- `friendly` + `friendly_invitee` + `friendly_result` (gespielt?)
- `ranking_entry` (gemeinsame Ranglisten für eine Challenge-Vorschlagsauswahl)
- `member.lastFriendlyAt`, `challenge.completedAt` (Inaktivität)

Vorteil On-Demand-Variante:
- Kein Cron, kein neues Schema, einfacheres Reasoning
- Bei jedem Refresh aktuelle Daten
- Wenn Notifications/Email kommen, kann später dazu eine
  `match_suggestion`-Tabelle als Cache + Audit-Log hinzukommen, **ohne**
  die API-Form zu brechen

Nachteil:
- Zwei Aufrufe können unterschiedliche Listen ergeben — bei v1 mit
  ~12–500 Mitgliedern aber egal

## Algorithmus

Eingabe: `viewerId` (Spieler, der seine Vorschläge will), `now`.

```
1. Kandidaten = alle Member außer Viewer, status = 'aktiv'
2. Filtere:
   - LK-Differenz > 2 (Default ±2 LK)
   - In den letzten 14 Tagen schon Match gespielt (FR-26 Cooldown)
3. Score pro Kandidat (höher = besser):
   - Basis-Score: 100 - 10 * |lkDiff|      // näher = mehr Punkte
   - + 50, wenn Kandidat seit > 4 Wochen kein Match gespielt hat
   - + 30, wenn die beiden noch nie ein Match miteinander hatten
   - + 20, wenn der Viewer selbst > 4 Wochen kein Match gespielt hat
     (= „du bist auch eingerostet, hier ein guter Partner")
4. Sortiere nach Score absteigend, nimm Top 5
5. Pro Vorschlag: ergänze Begründung (höchstes greifendes Kriterium)
   und eine empfohlene Rangliste (für Challenge):
   - Die Rangliste, in der beide Mitglied sind und deren Sprung-Regel
     erfüllt ist; bei mehreren die mit dem kleinsten Positions-Abstand;
     wenn keine → null (Challenge-Button disabled, nur Friendly)
```

### Begründungs-Reihenfolge (für UI-Text)

Erstes greifendes Kriterium gewinnt:
1. „X spielt selten — perfekte Gelegenheit" (Inaktivität)
2. „Neue Paarung — ihr habt noch nie gegeneinander gespielt"
3. „Ähnliche Stärke — LK-Differenz 0.5"

## API-Endpoint

| Methode | Pfad                  | Auth     | Zweck                              |
|---------|-----------------------|----------|------------------------------------|
| `GET`   | `/api/suggestions`    | session  | Eigene Vorschläge (max. 5)         |

### Response-Shape

```typescript
type SuggestionDto = {
  memberId: number
  firstName: string
  lastName: string
  dtbLk: number
  reason: 'inactive-partner' | 'new-pairing' | 'similar-strength'
  reasonText: string // vorgefertigter deutscher Text
  // Vorgeschlagene Rangliste für eine Challenge — null, wenn keine
  // gemeinsame Rangliste passt
  rankingId: number | null
  rankingName: string | null
}
```

## Cross-Modul-Aufrufe

| Aufrufer       | Aufgerufen        | Service-Funktion / Query                  | Zweck                                |
|----------------|-------------------|-------------------------------------------|--------------------------------------|
| `suggestions`  | `members`         | `profileService.listAll()`, `findById`    | Kandidaten + Self-Lookup             |
| `suggestions`  | `challenges`      | `listForMember`                           | Cooldown, schon-gespielt-Check       |
| `suggestions`  | `friendlies`      | `listForMember`                           | Cooldown, schon-gespielt-Check       |
| `suggestions`  | `rankings`        | `listStandingsForMember`, `getRankingMeta`, Strategy `validateChallenge` | Empfohlene Rangliste finden          |

Reine Read-only-Orchestrierung. Kein neuer Persistence-Code.

## UI-Skizze

Sektion auf der Home-Page, zwischen Greeting und „In Entwicklung":

```
┌─────────────────────────────────────────────────────────┐
│  Für dich vorgeschlagen                                  │
├─────────────────────────────────────────────────────────┤
│  Lisa Schmidt  · LK 10.5                                 │
│  Sie spielt selten — perfekte Gelegenheit                │
│  [Challenge senden]  [Friendly anbieten]                 │
│  ─────────────────────────────────────────               │
│  Tom Weber  · LK 9.0                                     │
│  Neue Paarung — ihr habt noch nie gegeneinander gespielt │
│  [Challenge senden]  [Friendly anbieten]                 │
│  ...                                                     │
└─────────────────────────────────────────────────────────┘
```

- Name + LK als Klick → `/spieler/[id]` (existierendes Profil)
- „Challenge senden" → direkter POST `/api/challenges` mit der
  empfohlenen Rangliste; bei Erfolg Toast „Challenge versendet", Vorschlag
  verschwindet (re-Fetch)
- „Friendly anbieten" → Redirect auf `/friendlies/new?opponentId=<id>`
  (existing Pre-fill in der Friendly-Form)
- Challenge-Button disabled, wenn keine passende Rangliste

Wenn die Liste leer ist (alle gerade gespielt, keiner in LK-Nähe): kurzer
Hinweis „Aktuell keine Vorschläge — schau später nochmal vorbei".

## Validierung und Edge-Cases

- Viewer ist pausiert → liefert leere Liste (er soll nicht spielen)
- Weniger als 5 Kandidaten passen → liefere weniger, kein Fehler
- Cooldown vom Viewer aktiv (max. 2 aktive Challenges) → Challenge-
  Button bleibt aktiv; Server lehnt ggf. mit 409 ab, Toast zeigt Grund
- Challenge-Endpoint kann eigenen Rate-Limit-Fehler werfen (3/Tag) → Toast
- Auto-Refresh nach erfolgreichem Click — der bestätigte Spieler fällt
  aus der Liste wegen Cooldown

## Tests

- **Unit `suggestionsService.suggestFor`**:
  - LK-Filter (±2)
  - Cooldown-Filter (14 Tage)
  - Score-Reihenfolge (Inaktiver wird bevorzugt)
  - „Neue Paarung"-Bonus greift
  - leere Liste, wenn keiner passt
  - empfohlene Rangliste: korrekt gewählt bzw. null wenn keine passt
- **Integration**: HTTP `GET /api/suggestions` als eingeloggter Member

## Offene Fragen

- **LK-Range hart vs. konfigurierbar?** v1 hart auf ±2; Konfig mit
  Saison-Einstellungen (FR-64) später
- **„Selten gespielt"-Schwelle?** > 4 Wochen ist die Default-Annahme aus
  der Trainer-Aktivität (matchesLast4Weeks). Konsistent halten.
- **Limit `5`?** Pragmatisch — passt auf einen Bildschirm-Drittel ohne
  Scrollen, Trainer-/Algorithmik-Wert ist gering. Konfigurierbar später.

## Out of Scope für diesen Schritt

- Persistierte Vorschläge / Cron
- Email-Versand
- Dismissal/Snooze
- Trainer-„Empfehlung versenden"-Button (FR-103)
- Pro-Spieler-Frequenz-Setting (FR-105)
- Doppel-Vorschläge (Friendly Doubles) — v1 nur Einzel-Partner-Suche
- Bevorzugte Spielarten aus Member-Preferences
