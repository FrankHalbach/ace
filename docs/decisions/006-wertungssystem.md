# 006 – Wertungssystem-Strategie

**Status**: akzeptiert
**Datum**: 2026-05-14
**Entscheider**: Frank

## Kontext

Die Spec (§ 4.5 und Anhang A) sieht drei wählbare Wertungs-Modelle vor:
**Pyramide**, **ELO**, **Hybrid**. Per Spec-Nachtrag
[N-01](../spec/nachtraege.md#n-01--punkte-tabelle-als-zusätzlicher-wertungs-modus)
kommt ein vierter Modus dazu: **Punkte-Tabelle**.

Modelle unterscheiden sich grundlegend:

| Modell           | Position-Logik                              | Match-Wirkung                                  | Beschränkung der Gegner            |
|------------------|---------------------------------------------|------------------------------------------------|------------------------------------|
| Pyramide         | Manuelle Reihenfolge, Sprung bei Sieg       | Sieg → Positions-Tausch (max. N Plätze)        | max. X Plätze nach oben            |
| ELO              | Position aus Rating-Ranking                 | Sieg → Rating-Adjustment beider Spieler        | LK- oder Rating-Range (konfig.)    |
| Hybrid           | Position + Rating kombiniert                | Sieg → Positions-Tausch *und* Rating-Update    | beides                             |
| Punkte-Tabelle   | Position aus Saison-Punkten                 | Sieg/Spielen → Punkte gemäß Tabelle            | keine                              |

Außerdem ist gemäß N-01 die Modus-Wahl **pro Rangliste** konfigurierbar
(Erweiterung gegenüber Spec Anhang A, das pro Saison konfigurierte).

Frage: wie strukturieren wir die Implementierung so, dass alle vier Modelle
heute funktionieren, der Modus-Wechsel sauber bleibt und ein fünftes Modell
später ohne Re-Architektur ergänzbar ist?

## Entscheidung

**Strategy-Pattern.** Ein Interface `RankingStrategy` definiert die wenigen
Operationen, die zwischen den Modellen variieren; jeder Modus ist eine
Implementierung dieses Interfaces. Die Auswahl erfolgt zur Laufzeit anhand des
auf der `Ranking`-Tabelle hinterlegten Modus-Schlüssels.

### Interface

```typescript
// server/modules/rankings/strategy/types.ts

export type RankingMode = 'pyramid' | 'elo' | 'hybrid' | 'points-table'

export interface RankingStrategy {
  readonly mode: RankingMode

  /**
   * Prüft, ob eine Challenge zwischen zwei Spielern im aktuellen Rangliste-
   * Zustand zulässig ist. Pyramide: Sprung-Distanz prüfen. Punkte-Tabelle:
   * immer erlaubt.
   */
  validateChallenge(
    input: ValidateChallengeInput,
  ): Result<void, ChallengeValidationError>

  /**
   * Wendet ein bestätigtes Match-Ergebnis auf die Rangliste an: Positions-
   * Tausch, Rating-Update, Punkte-Vergabe — je nach Modus.
   * Gibt die zu persistierenden Mutationen zurück (kein direkter DB-Zugriff).
   */
  applyResult(input: ApplyResultInput): RankingMutation[]

  /**
   * Bestimmt die Anfangs-Reihenfolge einer neuen Saison aus der Vorgänger-
   * Saison gemäß der gewählten FR-15-Strategie. Punkte-Tabelle nutzt nur die
   * LK-Ordnung, andere Modi auch die End-Position.
   */
  getInitialOrder(input: InitialOrderInput): MemberId[]

  /**
   * Liefert die UI-Anzeigedaten je Rangliste-Eintrag.
   * Pyramide: "#5". Punkte-Tabelle: "12 Pkt". Hybrid: beides.
   */
  getDisplayInfo(entry: RankingEntry): { primary: string; secondary?: string }
}
```

### Auswahl zur Laufzeit

```typescript
// server/modules/rankings/strategy/index.ts

import { PyramidStrategy } from './pyramid'
import { EloStrategy } from './elo'
import { HybridStrategy } from './hybrid'
import { PointsTableStrategy } from './points-table'

const STRATEGIES: Record<RankingMode, RankingStrategy> = {
  'pyramid': new PyramidStrategy(),
  'elo': new EloStrategy(),
  'hybrid': new HybridStrategy(),
  'points-table': new PointsTableStrategy(),
}

export function strategyFor(ranking: Ranking): RankingStrategy {
  return STRATEGIES[ranking.mode]
}
```

### Daten-Modell

Auf der `Ranking`-Tabelle:

- `mode: RankingMode` — der gewählte Modus, einmalig beim Saison-Start gesetzt,
  danach unveränderlich für diese Rangliste (FR-15c)
- `config: jsonb` — modus-spezifische Parameter (max. Sprung-Distanz für
  Pyramide, K-Faktor für ELO, Punktwerte für Punkte-Tabelle)

Auf der `RankingEntry`-Tabelle: alle Wertungs-Felder nebeneinander, je nach
Modus belegt oder NULL.

```
RankingEntry
├── memberId
├── rankingId
├── position       (immer gesetzt)
├── points         (Punkte-Tabelle, Hybrid optional)
├── eloRating      (ELO, Hybrid)
└── lastMatchAt
```

Zusätzlich `MatchPointsAward` (siehe N-01) — pro Match-Teilnahme ein Eintrag,
damit Korrekturen rückverfolgbar bleiben.

### Modus-Wahl

- **Saison-Default pro Altersgruppe** wird im Admin-Setup gewählt
- Beim Anlegen einer Rangliste übernimmt diese den Default ihrer Altersgruppe
- Admin kann den Modus einer einzelnen Rangliste vor Saison-Start überschreiben
- Nach Saison-Start ist der Modus eingefroren (FR-15c)
- Default-Empfehlungen v1:
  - **Jugend** (alle Klassen) → Punkte-Tabelle
  - **Aktive** → Pyramide
  - **Senioren** → Punkte-Tabelle

### Default-Modus v1

Wenn der Admin keine Wahl trifft, gilt **Pyramide** mit den Spec-Defaults aus
Anhang A. Damit ist der Verhalts-Default rückwärtskompatibel zur Original-Spec.

## Konsequenzen

### Positiv
- Vier Modelle gleichzeitig im selben System ohne Wenn-Else-Geflecht
- Modus-Wechsel zwischen Saisons ist Konfiguration, kein Code-Change
- Fünftes Modell (z. B. „Schweizer System") wäre eine neue Datei plus ein
  Strategy-Eintrag — bestehende Modi unberührt
- Verschiedene Modi pro Rangliste innerhalb derselben Saison möglich —
  Jugend kann mit Punkten laufen, während Aktive klassische Pyramide spielen
- Tests sind pro Strategie isoliert — keine Kreuz-Komplexität
- Strategy-Implementierungen sind pure Funktionen (nehmen Input, geben Mutationen
  zurück) — leicht zu testen ohne DB-Mock

### Negativ
- Mehr Abstraktion als ein hartkodiertes Modell — vier Klassen statt einem
  Code-Pfad
- `RankingEntry` trägt nullable Felder (`points`, `eloRating`) — TypeScript-
  Typen zeigen formal nicht, welche Felder im gewählten Modus relevant sind
- Konfigurations-`config: jsonb` ist nicht strikt typisiert — pro Strategie
  muss ein Zod-Schema gepflegt werden, das den Inhalt validiert

### Neutral
- v1 implementiert *alle vier* Modi. Auch wenn der Verein zunächst nur einen
  nutzt, ist der Aufwand für die anderen drei klein (~ ein paar hundert Zeilen
  pro Strategie). Der Architektur-Beweis steht damit.
- Doppel-Freundschaftsspiele (Punkte-Modus): Vergabe-Logik in
  `PointsTableStrategy.applyResult` — siehe offene Punkte in N-01

## Alternativen

### Alternative A: Hartkodiert auf ein Modell
Ein einziger Wertungs-Pfad im Code, z. B. Pyramide. Andere Modelle wären
spätere große Refactorings. Widerspricht ausdrücklich Spec § 4.5: „Spec und
Datenmodell sind so gestaltet, dass alle drei Modelle ohne Code-Änderung
möglich sind." Mit N-01 sind es vier — Hartkodierung wäre Sackgasse.

### Alternative B: Konfigurierbares Regel-Engine (z. B. JSON-DSL)
Beschreibe das Modell als Datenstruktur und interpretiere sie zur Laufzeit.
Mächtig, aber überdimensioniert: vier konkrete Modelle sind übersichtlich, eine
DSL würde mehr Komplexität einführen als sie spart.

### Alternative C: Plugins / dynamisches Loading
Strategien als getrennte Module nachladen. Verschiebt das Problem von Code auf
Konfiguration ohne klaren Nutzen — die Modelle sind Teil der Anwendungs-
Domäne, nicht Erweiterungen Dritter.

### Alternative D: Pro Modus eine eigene Code-Basis (verschiedene Apps)
Sinnloser Mehraufwand.

## Referenzen

- Spec § 4.5 Challenges, Anhang A
- Nachtrag [N-01 Punkte-Tabelle](../spec/nachtraege.md)
- ADR-005 (Modul-Schnitt) — `rankings` ist das Owner-Modul der Strategien
- [Strategy-Pattern bei refactoring.guru](https://refactoring.guru/design-patterns/strategy)
