# Feature-Design-Doc: `player-profile`

**Status**: entwurf
**Datum**: 2026-05-15
**Modul**: [`members`](../../architecture/overview.md#1-modul-schnitt) (Erweiterung)

## Ziel

Klick auf einen Spielernamen führt auf eine Profil-Page, die Basics
(Name, LK, Status, Geburtsjahr), aktuelle Ranglisten-Positionen und die
Match-Historie zeigt. Ersetzt das aktuelle „Toter Klick" auf Mitglieds-
Namen in Trainer-Tabelle, Ranglisten-Detail und (perspektivisch)
Friendly-/Challenge-Detail.

Sinnvoll für drei Zielgruppen:
- **Spieler selbst** (über UserMenu → „Mein Profil") — eigene Aktivität,
  eigene Ranglisten-Positionen
- **andere Spieler** (Klick auf einen Namen in einer Liste) — sehen
  Stärke und Aktivität potenzieller Gegner
- **Trainer/Admin** — Klick aus der Aktivitäts-Übersicht zum Detail

## Spec-Bezug

| FR-ID  | Kurzbeschreibung                                  | Abgedeckt durch                                      |
|--------|---------------------------------------------------|------------------------------------------------------|
| FR-1   | Profil mit Name, Geburtsjahr, Geschlecht, LK      | Header der Profil-Page                                |
| FR-3   | Mehrfache Ranglisten-Mitgliedschaft               | Sektion „Ranglisten"                                  |
| FR-42  | „X Matches in den letzten 4 Wochen"               | Aktivitäts-Anzeige im Header                          |
| FR-93  | Match zählt für Aktivität auch ohne Ergebnis      | Friendly mit Status PLAYED in Historie                |
| FR-6/7 | Sichtbarkeits-Stufen pro Feld                     | **Vereinfacht v1**: jeder eingeloggte sieht alles außer Email — siehe „Out of Scope" |

**Nicht abgedeckt** (verschoben):

- Voll ausgebaute Sichtbarkeits-Stufen (FR-6/7) — eigenes Feature
  `profile-visibility`. Aktuell zeigen wir alle Profil-Felder außer Email
  jedem eingeloggten User. Email bleibt nur dem eigenen User sichtbar.
- Profil bearbeiten anderer Spieler (Trainer/Admin) — bleibt im
  bestehenden `/profile` (Self-Service); Admin-Edit kommt mit `admin`-Modul
- Foto (FR-1) — eigenes Feature `profile-photo` mit Storage-Strategie
- Badges, Stärke-Verlauf, ELO-Graphen (FR-122) — eigene Iteration
- Block-/Mute-Funktion (FR-116) — eigenes Feature

## Datenmodell

Keine neuen Tabellen, keine Schema-Änderungen.

## API-Endpoints

| Methode | Pfad                                | Auth     | Zweck                                                |
|---------|-------------------------------------|----------|------------------------------------------------------|
| `GET`   | `/api/members/:id/profile`          | session  | Voll aggregiertes Spieler-Profil                     |

### Response-Shape

```typescript
type PlayerProfileDto = {
  // Profile-Header (Email nur wenn :id == eigenes memberId)
  id: number
  firstName: string
  lastName: string
  birthYear: number
  gender: 'm' | 'w'
  dtbLk: number
  status: 'aktiv' | 'pausiert'
  email: string | null  // nur fürs eigene Profil

  // Aktivität
  lastMatchAt: Date | null
  matchesLast4Weeks: number

  // Aktuelle Ranglisten-Positionen (nur ACTIVE Saisons)
  rankings: Array<{
    rankingId: number
    seasonName: string
    ageGroupName: string
    variant: 'herren' | 'damen' | 'offen'
    mode: 'pyramid' | 'elo' | 'hybrid' | 'points-table'
    position: number
    entryCount: number
  }>

  // Match-Historie (Challenges + Friendlies COMPLETED + Friendlies PLAYED),
  // chronologisch jüngste zuerst, max. 50 für v1.
  matches: Array<
    | {
        kind: 'challenge'
        challengeId: number
        rankingName: string  // "Aktive · Herren"
        opponentId: number
        opponentName: string
        result: 'win' | 'loss'
        sets: SetScore[]
        completedAt: Date
      }
    | {
        kind: 'friendly'
        friendlyId: number
        format: 'singles' | 'doubles'
        partnerId: number | null
        partnerName: string | null
        opponentIds: number[]
        opponentNames: string[]
        // bei PLAYED ohne Ergebnis: result == null
        result: 'win' | 'loss' | null
        sets: SetScore[]
        playedOrCompletedAt: Date
      }
  >
}
```

### Fehler-Codes

| Code               | HTTP | Bedeutung                |
|--------------------|------|--------------------------|
| `member.not-found` | 404  | Member existiert nicht   |

## Cross-Modul-Aufrufe

| Aufrufer    | Aufgerufen        | Funktion                                     | Zweck                                  |
|-------------|-------------------|----------------------------------------------|----------------------------------------|
| `members`   | `challenges`      | `listCompletedForMember(memberId)`           | Match-Historie (Challenges)            |
| `members`   | `friendlies`      | `listMatchedForMember(memberId)`             | Match-Historie (Friendlies + invitees) |
| `members`   | `rankings`        | `listEntriesForMember(memberId)`             | Aktuelle Ranglisten-Positionen        |
| `members`   | `trainer`         | `activityForMember(memberId)` (oder direkt)  | lastMatchAt + matchesLast4Weeks        |

Die meisten benötigten Daten liegen schon in den anderen Modulen — neue
Service-Funktionen sind dünne List/Filter-Wrapper. `members.profile`
bekommt eine neue `getMemberProfile(id, viewerId)` Funktion, die alles
orchestriert.

## UI-Skizze

### `/spieler/[id]`

```
┌─────────────────────────────────────────────────────────┐
│  Anna Admin                                              │
│  LK 12.0 · aktiv · *1975                                 │
│  Letzte Aktivität: vor 3 Tagen · 2 Matches in 4 Wochen   │
├─────────────────────────────────────────────────────────┤
│  Aktuelle Ranglisten                                     │
│  ┌────────────────────────────────────────┐              │
│  │ Sommer 2026 · Über 50 · Damen   #1 / 1 │              │
│  │ Sommer 2026 · Aktive · Damen    #4 / 8 │              │
│  └────────────────────────────────────────┘              │
├─────────────────────────────────────────────────────────┤
│  Match-Historie                                          │
│  Mi 15.05 · Challenge gegen Lisa Schmidt — Sieg 6:4 6:3  │
│  Sa 10.05 · Friendly gegen Tom Weber — gespielt          │
│  ...                                                     │
└─────────────────────────────────────────────────────────┘
```

Mobile: alles vertikal, Karten-Layout.

### Linking

Cross-Links als NuxtLink auf `/spieler/${memberId}` aus:

- **Trainer-Aktivitäts-Tabelle**: jeder Spieler-Eintrag wird klickbar
- **Ranglisten-Detail** (`/ranglisten/[id]`): jeder Spieler-Name wird Link
- **Eigenes Profil** (`/profile`) bekommt Link „Mein Spieler-Profil →"
- **UserMenu** „Mein Spieler-Profil" (zusätzlich zu „Mein Profil bearbeiten")
- **Bewusst nicht** in Friendly-/Challenge-Detail — dort soll der User sich
  auf die Aktion (Bestätigen/Ablehnen/Melden) konzentrieren, nicht
  wegnavigieren

## Validierung und Edge-Cases

- Profil eines pausierten Spielers wird normal gezeigt, mit Status-Badge
- Profil ohne Match-Historie: leerer Block mit Hinweis „Noch keine Matches"
- Profil ohne Ranglisten-Mitgliedschaft (z. B. weil keine Saison aktiv):
  leere „Aktuelle Ranglisten"-Liste mit kurzem Hinweis
- Friendly mit ABGESAGTEM/CANCELLED Status erscheint **nicht** in der
  Historie — nur PLAYED und COMPLETED zählen als „Match"
- Match-Modus, Doppel-Partner: für Friendlies ist `partnerName` bei Doppel
  gesetzt, sonst null
- Default-Limit: 50 Einträge — mehr braucht v1 nicht; Pagination kommt
  später falls nötig

## Tests

- **Unit `members.getMemberProfile`**: aggregiert korrekt; Email nur fürs
  eigene Profil
- **Integration**: voller HTTP-Flow `GET /api/members/:id/profile` für
  einen Member mit Challenges und Friendlies → Historie sortiert,
  Rankings gefüllt, Aktivität korrekt
- **Edge-Case**: Member ohne Matches → leere Historie, lastMatchAt null

## Offene Fragen

- **Friendly-Doppel-Sieger-Anzeige**: bei Doppel hat das Sieger-Team 2
  IDs. UI: „Sieg" oder „Niederlage" aus Sicht des Profil-Inhabers — wenn
  er im Sieger-Team war = Sieg. Klar.
- **Statistik-Aggregat**: Win-Rate, Anzahl gespielte Saisons, etc. —
  aufschieben in eigene Iteration; v1 zeigt nur die Liste

## Abhängigkeiten zu anderen Features

Keine harten Vor-Abhängigkeiten. Bestehende Module reichen:
- `members` (Profil-Basics)
- `challenges`, `friendlies`, `friendly-results`, `results`, `rankings`
  liefern die Historie und Positionen

## Out of Scope für diesen Schritt

- FR-6/7 voll ausgebaute Sichtbarkeits-Stufen — Email versteckt, Rest
  öffentlich für eingeloggte
- Profil-Foto (FR-1) — eigenes Feature
- Badges (FR-122)
- Stärke-Verlauf, ELO-Graphen
- Pagination der Match-Historie (v1: hard cap 50)
- Edit-Funktion auf fremden Profilen
- Block-Funktion (FR-116)
- Kontaktdaten (Telefon, Email) — kommt mit FR-7-Sichtbarkeit
