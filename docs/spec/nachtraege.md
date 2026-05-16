# Spec-Nachträge seit v1.0

Diese Datei sammelt fachliche Ergänzungen und Klarstellungen, die nach der
Veröffentlichung von [`spec-v1.0.html`](spec-v1.0.html) entstanden sind.
Sobald genügend Nachträge aufgelaufen sind, fließen sie in eine Spec v1.1 ein
und diese Datei wird zurückgesetzt.

Jeder Nachtrag hat eine eindeutige ID (`N-NN`) und referenziert die berührten
FR-IDs der Originalspec, wenn vorhanden.

---

## N-01 · Punkte-Tabelle als zusätzlicher Wertungs-Modus

**Status**: vorgeschlagen
**Datum**: 2026-05-14
**Quelle**: Trainer-Feedback
**Berührte FR-IDs**: FR-15, FR-20b, FR-21, FR-25b, FR-33, FR-93, FR-120, FR-122

### Anforderung

Insbesondere zur Aktivierung der Jugend soll ein Wertungssystem zur Verfügung
stehen, in dem Spieler **Punkte für das Spielen selbst** sammeln (nicht nur für
Siege) und ihre Tabellenposition aus den akkumulierten Punkten ergibt — statt
durch Positions-Tausch nach Pyramide- oder ELO-Logik.

Die Spec sieht bereits drei wählbare Wertungs-Modelle vor (Pyramide, ELO,
Hybrid, siehe § 4.5 und Anhang A). Dieser Nachtrag erweitert die Modell-Liste
um einen vierten Modus „Punkte-Tabelle" und macht die Wahl außerdem feiner
granular.

### Mechanik des Modus „Punkte-Tabelle"

Position in der Rangliste = Summe der Spielpunkte der aktuellen Saison,
sortiert absteigend (LK als Tiebreaker).

**Punkte je Match-Ausgang** (Default-Werte, pro Rangliste konfigurierbar):

| Match-Ausgang                              | Punkte Sieger | Punkte Verlierer |
|--------------------------------------------|---------------|------------------|
| Challenge mit bestätigtem Ergebnis         | 3             | 1                |
| Freundschaftsspiel mit Ergebnis            | 2             | 1                |
| Freundschaftsspiel ohne Ergebnis (FR-93)   | 1 je Teilnehmer                  |
| Walk-over (Nicht-Erscheinen Gegner)        | 2             | 0                |
| Diversitäts-Bonus (neuer Gegner)           | + 1 für beide                    |

**Anti-Cherry-Picking:**

Im Punkte-Modus dürfen alle Spieler ohne Sprung-Beschränkung herausgefordert
werden (FR-21 entfällt für diesen Modus). Gegen systematisches Spielen gegen
Schwächere greifen:

- Cooldown gegen denselben Gegner (FR-26) bleibt unverändert
- Diversitäts-Bonus von 1 Punkt für beide Spieler bei einer neuen Paarung —
  belohnt Vernetzung statt Spielen gegen denselben „leichten" Gegner

ELO-artige LK-basierte Punkte-Skalierung wurde diskutiert und verworfen, weil
sie die Einfachheit des Modus aushebelt. Beobachtung im Betrieb wird zeigen,
ob das ausreicht.

### Granularität der Modus-Wahl — pro Rangliste

Bislang sieht die Spec die Modell-Konfiguration pro Saison vor (Anhang A:
„Modell: Pyramide"). Dieser Nachtrag verfeinert das: das Modell wird **pro
Rangliste** konfiguriert. Damit kann eine Saison gleichzeitig haben:

- Jugend U15 / U18 → Punkte-Tabelle
- Aktive Herren / Damen → Pyramide
- Senioren → Hybrid

Default-Modus pro Altersgruppe in den Saison-Einstellungen wählbar. Beim Anlegen
einer Rangliste übernimmt sie den Default ihrer Altersgruppe.

### Auswirkungen auf einzelne FR-IDs

| FR-ID   | Originaltext (Kurz)                              | Modus-Verhalten                                                                 |
|---------|--------------------------------------------------|---------------------------------------------------------------------------------|
| FR-15   | Initiale Reihenfolge aus Vorgängersaison         | Punkte-Modus: alle starten bei 0 Punkten, LK bestimmt Tiebreaker                |
| FR-15a  | Strategien 1:1 / Reset / Abgemildert             | Punkte-Modus: Strategien gelten nur für Position-basierte Modi                  |
| FR-20b  | „Match bewegt Position in gewählter Rangliste"   | Punkte-Modus: „Match vergibt Punkte gemäß Tabelle"                              |
| FR-21   | Sprung-Regel (z. B. max. 3 Plätze)               | Punkte-Modus: keine Sprung-Regel                                                |
| FR-25d  | Nach 24 Wochen Inaktivität ans Ende sortieren    | Punkte-Modus: Punkte bleiben, Spieler fällt ohnehin in die Tabelle              |
| FR-122  | Badges                                           | Neuer Badge-Kandidat „Punktesammler" (≥ N Punkte/Saison, Schwelle konfigurierbar)|

### Auswirkungen auf das Datenmodell

`RankingEntry` trägt mehrere Wertungs-Felder, je nach Modus relevant:

```
RankingEntry
├── memberId
├── rankingId
├── position        (immer gesetzt — für UI-Sortierung)
├── points          (nur Punkte-Tabelle)
├── eloRating       (nur ELO / Hybrid)
└── ...
```

Außerdem eine separate Tabelle `MatchPointsAward` mit einem Eintrag pro
Match-Teilnahme. Begründung: Audit-Fähigkeit bei Korrekturen (FR-35), und beim
Modus-Wechsel zwischen Saisons bleibt die Punkte-Historie erhalten.

```
MatchPointsAward
├── matchId
├── memberId
├── rankingId
├── points
├── reason         (sieg | niederlage | walkover | diversity-bonus | friendly | ...)
└── awardedAt
```

### Offene Punkte

- Sollen Doppel-Freundschaftsspiele alle vier Spieler gleich werten, oder
  Sieger-Paar/Verlierer-Paar?
- Zählen die Punkte über mehrere Ranglisten desselben Spielers (mehrfach), oder
  einmal pro Match? Vorschlag: einmal pro Match, gewählte Rangliste bekommt
  die Punkte
- Sind Spielpunkte aus archivierten Saisons im Profil sichtbar (Historie)?
  Vorschlag: ja, als zusätzliche Karte „Saison-Bilanz" im Profil
- Diversitäts-Bonus rückwirkend bei späten Bestätigungen — wann genau wird er
  ausgelöst (bei Match-Anlage, bei Ergebnis-Bestätigung)?

### Auswirkung auf ADRs

- **ADR-006 (Wertungssystem-Strategie)** integriert diesen Modus als vierte
  Implementierung neben Pyramide, ELO und Hybrid. Strategie-Pattern.

---

## N-02 · User-Menu im Header und Theme-Mode (light/dark/system)

**Status**: vorgeschlagen
**Datum**: 2026-05-15
**Quelle**: Produktentscheidung
**Berührte FR-IDs**: NFR-1 (Mobile-First)

### Anforderung

Eingeloggte Mitglieder bekommen einen einheitlichen Header mit Avatar-
basiertem User-Menu. Aus dem Menü erreichbar:

- Mein Profil
- Theme-Mode-Auswahl: `light` / `dark` / `system` (Default `system`)
- Logout

Die Theme-Auswahl wird im Browser des Mitglieds (LocalStorage) persistiert
und nicht serverseitig gespeichert — kein Schema-Change, keine API-
Änderung. `system` folgt dem `prefers-color-scheme` des Gerätes.

### Begründung

- Aktuell rollt jede Page ihren eigenen Header-Streifen mit „Willkommen,
  X" + Logout — uneinheitlich, dupliziert
- Theme-Mode ist eine pure UX-Verbesserung (NFR-1: viel Smartphone-Nutzung
  am Platz, draußen Sonne / abends Halle)
- @nuxt/ui bringt `useColorMode` ohnehin mit; der Toggle ist ein UI-Element
  drumherum

### Out of Scope dieses Nachtrags

- Foto-Upload (FR-1) — eigenes Feature `profile-photo`, mit Storage-Strategie
- Theme-Tokens (Brand-Farben) anpassen — bleibt wie aktuell konfiguriert
- Server-seitige Theme-Persistenz (würde bei Geräte-Wechsel synchronisieren) —
  v2, falls Bedarf entsteht

---

## N-03 · Altersgruppen-Naming bleibt vereinsspezifisch

**Status**: umgesetzt
**Datum**: 2026-05-15 (erweitert 2026-05-16)
**Quelle**: Produktentscheidung TuS Neureut
**Berührte FR-IDs**: FR-2d, FR-2j

### Anforderung

Spec FR-2d nennt explizit „Senioren-Klassen (H40, H50, H60 sowie D40, D50)".
Beim TuS Neureut wird der Begriff „Senioren" **nicht** verwendet — die
Altersgruppen heißen dort z. B. „Über 50", „Über 60". FR-2j sieht diese
Freiheit bereits vor (Admin definiert Altersgruppen pro Saison frei mit
eigenem Namen).

Konkrete Konsequenzen:

- **Seed/Demo-Daten** verwenden „Über 50" statt „Senior 50+".
- **Spec-Beispiele** sind als Beispiele zu verstehen, keine Vorgaben.
- **Schema-Feld `MatchPreferences.seniorsFriendly`** wurde nach
  `ageGroupFriendly` umbenannt, UI-Label nach „Altersklassen-
  Freundschaftsspiele". Vor dem Mitglieder-Launch gibt es keine
  Production-Daten — der lokale Dev-Stand wird per `db:reset` neu
  geseedet (`DEFAULT_PREFERENCES` schreibt direkt den neuen Key); keine
  Migration nötig. Mutable Feature-Docs (`core-auth-members`,
  `friendlies`, `rankings`, `seasons`) verwenden „Altersklassen" als
  vereinsneutralen Sammelbegriff.

### Out of Scope dieses Nachtrags

- Anpassung von `docs/spec/spec-v1.0.html` — kommt in Spec v1.1; bis
  dahin gilt N-03 als verbindliche Ergänzung
- Anpassung von ADR `006-wertungssystem.md` — ADRs sind nach Akzeptanz
  unveränderlich (CLAUDE.md); die Default-Mode-Tabelle dort verwendet
  noch „Senioren", inhaltlich gemeint sind die Altersklassen
