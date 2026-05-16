# Altersgruppen als eigenständige Konkurrenzen

**Status**: Design — wartet auf Sichtung
**Datum**: 2026-05-16
**Berührte FR-IDs**: FR-2d, FR-2j, FR-10, FR-10b
**Berührte Nachträge**: N-03 (Altersgruppen-Naming)

## Problem

Heute hat eine Altersgruppe eine `genderRule` (`mixed | separate | both`),
aus der `generateForSeason` 1–3 Ranglisten je Schiene erzeugt:

| genderRule | erzeugte Varianten          |
| ---------- | --------------------------- |
| `mixed`    | Offen                       |
| `separate` | Herren + Damen              |
| `both`     | Herren + Damen + Offen      |

Im Admin-UI muss man also eine Altersgruppe „Herren" anlegen und dort
eine Geschlechtsregel „Herren + Damen + Offen" wählen — die Sprache des
Datenmodells, nicht die des Vereins.

Im Verein (TuS Neureut, nuLiga-Mannschaftsliste 2026) heißen die
Konkurrenzen tatsächlich:

```
Herren · Herren 30 · Herren 40
Damen · Damen 30 · Damen 40 · Damen 50
Junioren U18 · Junioren U15 · Junioren U12
Juniorinnen U18 · Juniorinnen U15
Kleinfeld U9 · Großfeld U12
```

Beobachtungen:

1. Jede Zeile ist eine **eigenständige Konkurrenz**, keine Variante einer
   gemeinsamen Altersschiene. Es gibt keinen Verein, der „Herren 40 +
   Damen 40 + Offen 40" als eine Sache denkt.
2. **Min-Altersgrenzen können je Geschlecht abweichen** — typisch in
   Süddeutschland: Damen 30 startet teilweise ab 28, Junioren U15 vs.
   Juniorinnen U15 unterschiedlich. Das Cross-Product-Modell kann das
   nicht abbilden.
3. **„Offen"-Ranglisten gibt es vereins-realistisch nicht** als
   Liga-Konkurrenz. Sie sind ein ace-internes Konstrukt aus FR-10b
   (geschlechtsoffene Spiel-Praxis innerhalb des Vereins). Wenn sie
   gewünscht sind, sind sie als eigene Altersgruppe „Offen 18+"
   konfigurierbar, kein Auto-Add.

## Entscheidung

Eine `AgeGroup`-Zeile entspricht **einer** Rangliste = einer Konkurrenz.

**Schema-Änderung `age_group`:**

| Spalte             | vorher                              | nachher                       |
| ------------------ | ----------------------------------- | ----------------------------- |
| `gender_rule`      | `'mixed' \| 'separate' \| 'both'`   | entfernt                      |
| `gender` _(neu)_   | —                                   | `'m' \| 'w' \| 'mixed'`       |

Mapping `gender`:

- `'m'` → nur männliche Mitglieder (vorher: variant `herren`)
- `'w'` → nur weibliche Mitglieder (vorher: variant `damen`)
- `'mixed'` → alle Geschlechter (vorher: variant `offen`)

**Schema-Änderung `ranking`:**

| Spalte    | vorher                            | nachher  |
| --------- | --------------------------------- | -------- |
| `variant` | `'herren' \| 'damen' \| 'offen'`  | entfernt |
| Unique    | `(seasonId, ageGroupId, variant)` | `(seasonId, ageGroupId)` |

`generateForSeason` legt **eine** Rangliste pro aktiver Altersgruppe an,
ohne Cross-Product, ohne `variantsForGenderRule`.

`fitsInRanking` filtert nur noch nach `ageGroup.gender` (statt `variant`)
und Min/Max-Alter.

**Admin-UI:**

- Feldlabel „Geschlechtsregel" → „Geschlecht"
- Items: „Herren (m)", „Damen (w)", „Gemischt (offen)"
- Default neu: `'m'` (statt `'both'`) — niemand legt mehr „auto-3"
  versehentlich an.
- Liste in der Saison-Detailansicht zeigt `{name} · {Alter} · {Geschlecht}`.

**Public-UIs (ranglisten/[id], ranglisten/index, spieler/[id]):**

- `variantLabel`-Helper entfällt. Anzeige reduziert sich auf
  `ag.name` (z. B. „Herren 40", „Juniorinnen U15"). Damit verschwindet
  auch die Doppel-Information „Herren · Herren" bei Konkurrenz-Namen,
  die das Geschlecht schon enthalten.
- Filter-Dropdown „Geschlecht" auf `/ranglisten` entfällt; die Filterung
  geschieht jetzt natürlich über die AgeGroup-Auswahl. (Falls Bedarf
  besteht, das später wieder einzuführen, geht es über `ageGroup.gender`.)

## Migrations-Strategie

Saubere SQLite-Migration, ohne Daten-Mapping aus der Produktion (es gibt
noch keine Production-Daten — N-03):

1. `age_group.gender` als neue Spalte (`text NOT NULL`) — Default beim
   Erzeugen aus Migration heraus: `'mixed'` (für etwaige Dev-Daten
   harmlos, wird durch Re-Seed sofort überschrieben).
2. `age_group.gender_rule` droppen (SQLite: Tabelle neu, Daten kopieren).
3. `ranking` neu erzeugen ohne `variant`-Spalte, mit neuem Unique-Index
   `(season_id, age_group_id)`. Daten kopieren — falls in Dev-DBs
   mehrere `ranking`-Zeilen pro AG bestehen, gewinnt die mit der
   kleinsten `id` (deterministisch); das ist akzeptabel, weil lokale
   Dev-Daten ohnehin per `pnpm db:reset` neu gebaut werden.
4. Hinweis im Migration-Header: vorher `pnpm db:reset`, falls Dev-Daten
   vorhanden sind, die nicht verlierbar sind.

## Tests-Auswirkung

Folgende Test-Dateien referenzieren `genderRule` / `variant` und müssen
auf das neue Modell aktualisiert werden:

- `tests/seasons/seasons.test.ts`
- `tests/rankings/generate.test.ts`
- `tests/challenges/full-flow.test.ts`
- `tests/suggestions/suggestions.test.ts`
- `tests/members/player-profile.test.ts`
- `tests/trainer/trainer.test.ts`

Die meisten setzen Test-Seasons mit `genderRule: 'separate'` auf — ersetzt
durch zwei separate AgeGroups mit `gender: 'm'` und `gender: 'w'`.
`generate.test.ts` braucht eine angepasste Erwartung an Anzahl Ranglisten
pro Saison.

## Was nicht im Scope ist

- **Doppel-Konkurrenzen** — Spec § 7 schließt Doppel-Ranglisten aus v1
  aus. Das neue Modell macht es leichter, später als zusätzliche
  AgeGroup-Klasse einzuführen (z. B. Spalte `discipline: 'single' |
  'double'`), aber nicht jetzt.
- **Liga-Spielklasse als Feld** (Bezirksliga, Kreisliga, …). nuLiga
  hat das, ace v1 braucht es nicht — der Konkurrenz-Name reicht.
- **Auto-Sync von nuLiga** — bewusst out of scope.

## Follow-Up (Phase 2, eigenes Feature nach Mitglieder-Launch)

**Konkurrenz-Vorlagen** — Altersgruppen einmal vereinsweit definieren
und in jede Saison übernehmen. Skizze:

- Neue globale Tabelle `competition_template` mit denselben Feldern
  (`name`, `gender`, `minAge`, `maxAge`, `active`).
- Saison-Anlegen-Flow erhält Button „Aus Vorlagen übernehmen", der die
  aktiven Templates **als Snapshot** in `age_group` kopiert. Kein
  Live-Link — wenn der Verein die Altersgrenze einer Vorlage später
  ändert, betrifft das nur künftige Saisons.
- Eigener Admin-Bereich `/admin/konkurrenzen` zur Pflege der Vorlagen,
  unabhängig vom Saison-Lifecycle.
- Aufwand: vergleichbar mit Phase 1 (neue Tabelle, Repo, Service,
  Admin-UI).
- Begründung für „später": entlastet die Saison-Anlage, ist aber keine
  Voraussetzung für den Mitglieder-Launch. Den brauchen wir mit dem
  aktuellen, vereinfachten Modell.

## Migration-/Launch-Hinweis

Kein Live-Datenbestand betroffen. ace ist im Pre-Launch-Status (siehe
N-03). Saisons sind im Status `PLANNED` voll editierbar; aktive
Demo-/Dev-Daten werden via `pnpm db:reset && pnpm db:seed` neu erzeugt.
