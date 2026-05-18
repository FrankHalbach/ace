# Walk-Over und Aufgabe als Match-Ausgang

**Status**: Design — Implementierung folgt
**Datum**: 2026-05-16
**Berührte FR-IDs**: FR-30 (Result-Reporting), FR-31 (Bestätigung), FR-32 (Auto-Dispute)
**Closes**: #29 (A5 Walk-Over), #30 (A6 Aufgabe)

## Problem

Heute kennt `match_result` und `friendly_result` nur „reguläre" Matches mit
vollständigem Satz-Score und konsistentem Sieger. Zwei reale Match-Ausgänge
fallen durchs Raster:

- **Walk-Over (`w.o.`)** — Spieler erscheint nicht oder zieht vor
  Match-Beginn zurück. Heute nur als DISPUTED-Challenge lösbar; Trainer
  muss manuell beenden.
- **Aufgabe (`ret.`)** — Spieler bricht während des Matches ab. Teilscore
  wie `6:2, 3:1 ret.` ist Standard, wird heute aber von
  `verifyWinnerConsistency` als „Sieger inkonsistent" abgelehnt.

## Entscheidung

Neues Feld **`outcome`** auf `match_result` und `friendly_result`:

| Wert         | Bedeutung                                         | `sets`-Array     |
| ------------ | ------------------------------------------------- | ---------------- |
| `regular`    | reguläres Match (Default, vorhandenes Verhalten) | vollständige Sätze pro Modus |
| `walkover`   | kein Match (Nichterscheinen / Zurückziehen)      | leer (`[]`)      |
| `retirement` | Aufgabe während des Matches                       | 1..3 Sätze, letzter Satz darf unvollständig sein |

`outcome` ist **kein Bestandteil der Spieler-Auswahl** wie ein Modus — er
beschreibt _wie das Match endete_, nicht wie gespielt wurde. Der Modus
(`matchMode`) bleibt orthogonal erhalten.

Zusätzlich: optionales **`outcome_note: text | null`** für freie Notiz
(z. B. „Verletzung Knie", „Hat 30 min nach Termin nicht geschrieben").

### `winnerId` bei Walk-Over und Aufgabe

Wird **explizit** gemeldet, _nicht_ aus dem Score abgeleitet. Bei
`retirement` führt der Aufgebende ggf. im Teilscore — Sieger ist trotzdem
der Gegner.

### Validierung

| outcome      | `validateSetsForMode`             | `verifyWinnerConsistency` |
| ------------ | --------------------------------- | ------------------------- |
| `regular`    | wie bisher                        | wie bisher                |
| `walkover`   | `sets` muss leer sein             | übersprungen              |
| `retirement` | letzter Satz darf unvollständig sein (siehe unten); alle vorherigen Sätze müssen gültig sein | übersprungen |

**Unvollständiger letzter Satz bei `retirement`**:
- Beide Werte ≥ 0
- Werte dürfen nicht gleich sein (Aufgabe bei `0:0` wäre `walkover`)
- Beide Werte UNTER der Sieg-Schwelle des Modus (< 6 für reguläre Sätze,
  < 10 für Match-TB — weitere Modi siehe Issue #58)
- Ein _vollständiger_ letzter Satz bei `retirement` ist trotzdem gültig
  — typisch wenn jemand nach Satz 2 aufgibt: `6:2, 4:6` ret.

### Strategy-Verhalten

Issue #29 lässt die Strategy-Konsequenzen offen. Vorgeschlagene Defaults:

| Strategy        | Walk-Over                    | Retirement                   |
| --------------- | ---------------------------- | ---------------------------- |
| `pyramid`       | Positions-Tausch wie regulär | Positions-Tausch wie regulär |
| `elo`           | **kein** Rating-Update       | **kein** Rating-Update       |
| `hybrid`        | Position wie pyramid, kein ELO | gleich                       |
| `points-table`  | `walkoverWin` für Sieger, `challengeLoss` für Verlierer | Sieger bekommt `challengeWin`, Verlierer `challengeLoss` (war anwesend) |

**Begründungen**:
- _ELO/Hybrid_: Walk-Over und Aufgabe sind keine validen Skill-Signale.
  Ein Match, das nie zu Ende gespielt wurde, sollte das Rating nicht
  verschieben. Alternative „reduzierter K-Faktor" ist Folgearbeit für
  später (eigenes Issue).
- _Points-Table Walk-Over_: `walkoverWin` existiert bereits in der Config
  (Default 2). Verlierer bekommt nur `challengeLoss` (kein
  „Erscheinungspunkt"), weil er nicht erschienen ist.
- _Points-Table Retirement_: beide haben gespielt → voller `challengeWin`
  und `challengeLoss` wie regulär. Der Unterschied „regulär vs.
  retirement" zeigt sich höchstens im UI, nicht in der Wertung.

### Friendlies

`outcome` auf `friendly_result` analog. Keine Rangliste-Konsequenz, weil
Friendlies nicht in Ranglisten einfließen. UI-Anzeige als „Walk-Over" /
„Aufgabe" in der Match-Historie.

## Schema-Änderung

Migration `0007_match_outcome.sql`:

```sql
ALTER TABLE match_result ADD COLUMN outcome TEXT NOT NULL DEFAULT 'regular';
ALTER TABLE match_result ADD COLUMN outcome_note TEXT;
ALTER TABLE friendly_result ADD COLUMN outcome TEXT NOT NULL DEFAULT 'regular';
ALTER TABLE friendly_result ADD COLUMN outcome_note TEXT;
```

Bestehende Zeilen bekommen automatisch `outcome='regular'` — semantisch
korrekt (alte Matches waren alle regulär).

## API

`POST /api/challenges/:id/result` Body-Schema:

```ts
{
  winnerId: number,           // wie bisher, jetzt PFLICHT auch bei walkover
  outcome?: 'regular' | 'walkover' | 'retirement',  // default 'regular'
  sets: SetScore[],            // [] bei walkover, partial erlaubt bei retirement
  matchMode?: MatchMode,       // wie bisher
  outcomeNote?: string,        // freier Text, max 500 Zeichen
}
```

Analog für `POST /api/friendlies/:id/result`.

## UI

`/challenges/:id` und `/friendlies/:id` (Report-Form):

- Neuer Radio/Select „Match-Ausgang": Reguläres Match (Default) /
  Aufgabe / Walk-Over
- Bei „Walk-Over": Sätze-Eingabe ausgeblendet, Hinweis „Kein Score erfasst"
- Bei „Aufgabe": Sätze-Eingabe sichtbar wie regulär, plus Hinweis
  „Letzter Satz darf unvollständig sein"; explizite Sieger-Auswahl
  hervorgehoben (kann vom Teilscore abweichen)
- Optionales Notiz-Feld bei beiden

Match-Historie (Profil, Challenge-Detail) zeigt:
- `w.o.` Suffix nach „Sieg/Niederlage" bei Walk-Over
- `ret.` Suffix nach dem Score bei Aufgabe (z. B. „6:2, 3:1 ret.")

## Out of Scope

- **Disqualifikation (`default`)** — als vierter outcome-Wert denkbar,
  aber kein Issue offen. v1.1.
- **Reduzierter K-Faktor bei ELO/Hybrid für Walk-Over/Retirement** —
  Folgearbeit, eigenes Issue.
- **Walk-Over-Auto-Aufruf via Cron** (z. B. „Spieler erscheint nicht
  innerhalb von 14 Tagen nach Accept → Auto-Walk-Over für den Gegner")
  — eigenes Feature, separates Issue. Erstmal manuelle Meldung.
- **Bestätigungs-Pfad für Walk-Over**: bleibt wie bisher
  (Verlierer-bestätigt, sonst Cron-Auto-Dispute nach 3 Tagen). Bei
  Walk-Over könnte der Bestätigungs-Pfad kürzer sein („Verlierer ist eh
  nicht da") — bewusst vertagt.
