# Feature-Design-Doc: `rankings`

**Status**: entwurf
**Datum**: 2026-05-15
**Modul**: [`rankings`](../../architecture/overview.md#1-modul-schnitt)

## Ziel

Pro Saison entstehen Ranglisten. Jede Rangliste ist die Kombination
`Saison × Altersgruppe × Variante` (Herren / Damen / Offen). Mitglieder
werden anhand der Saison-Regeln in die passenden Ranglisten eingetragen
und in einer initialen Reihenfolge sortiert. Eingeloggte Mitglieder können
Ranglisten lesen.

Mutationen (Position-Tausch, Punkte-Aktualisierung) sind explizit **nicht**
Teil dieses Features — die kommen mit `challenges` und `results`.

## Spec-Bezug

| FR-ID         | Kurzbeschreibung                                              | Abgedeckt durch                                |
|---------------|---------------------------------------------------------------|------------------------------------------------|
| FR-2          | Auto-Zuordnung anhand Geburtsjahr, Mehrfach-Zugehörigkeit     | `assignMember`-Service                          |
| FR-2e         | Spieler ab Mindestalter steht in seiner + allen jüngeren Altersklassen sowie bei den Aktiven | DTB-Logik im Service                            |
| FR-2f         | Auto-Aufnahme konfigurierbar (Auto vs. Opt-in)                | `Season.config.autoAssign` (Default: auto)      |
| FR-3          | Spieler in mehreren Ranglisten gleichzeitig                   | mehrfache `RankingEntry`-Zeilen pro Member      |
| FR-10         | Pro Erwachsenen-AgeGroup drei Ranglisten (Herren/Damen/Offen) | Rangliste-Generierung beim Saison-Start         |
| FR-10a        | Erwachsene auto-eingetragen in Geschlechter + Offen           | Service-Logik                                   |
| FR-10b        | Jugend ohne Offene Rangliste                                  | AgeGroup.genderRule = mixed → nur Offene        |
| FR-11         | Ranglisten für eingeloggte Mitglieder einsehbar               | `GET /api/rankings` (session-protected)         |
| FR-12         | Sortierung primär nach interner Wertung, LK als Anzeige       | Strategy-getriebene Sortierung                  |
| FR-13         | Filter Altersgruppe, Geschlecht, „nur aktive"                 | Query-Parameter auf `/api/rankings`             |
| FR-14         | Alle Plätze in allen Ranglisten transparent im Profil         | abgeleitet, ohne neue Daten                     |
| FR-15         | Initiale Reihenfolge aus Vorgängersaison                      | drei Strategien (`takeover` / `reset` / `softened`) |
| FR-15a        | 1:1 / Reset / Abgemildert konfigurierbar                      | `Season.config.transition`                      |
| **N-01**      | Punkte-Tabelle als vierter Wertungsmodus                      | `RankingMode.points-table` (Strategy)           |
| **ADR-006**   | Strategy-Pattern für Wertungsmodi                             | `RankingStrategy`-Interface + 4 Implementierungen |

**Nicht abgedeckt** (eigene Features):

- Position-/Punkte-**Mutation** durch Match-Ergebnisse → `results`
- Cooldown- und Sprung-Validierung beim Challenge-Erstellen → `challenges`
- Cherry-Picking-Bonus, Diversitäts-Bonus → `challenges`
- Auto-Pause / Auto-Sortierung-ans-Ende → `members` (Cron + Service-Anpassung)

## Datenmodell

### `Ranking`

```typescript
export const ranking = sqliteTable('ranking', {
  id: integer('id').primaryKey({ autoIncrement: true }).$type<RankingId>(),
  seasonId: integer('season_id').notNull()
    .references(() => season.id, { onDelete: 'cascade' }).$type<SeasonId>(),
  ageGroupId: integer('age_group_id').notNull()
    .references(() => ageGroup.id, { onDelete: 'cascade' }).$type<AgeGroupId>(),
  variant: text('variant', { enum: ['herren', 'damen', 'offen'] }).notNull(),
  mode: text('mode', {
    enum: ['pyramid', 'elo', 'hybrid', 'points-table'],
  }).notNull(),
  // Config (modus-spezifisch). z. B. Pyramide.maxJumpUp, ELO.kFactor,
  // Points-Tabelle.pointValues. Zur Validierung pro Strategie ein
  // Zod-Schema.
  config: text('config', { mode: 'json' }).$type<RankingConfig>().notNull().default({}),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('ranking_unique_idx').on(t.seasonId, t.ageGroupId, t.variant),
])
```

`variant` Werte:
- `herren` — nur Männer
- `damen` — nur Frauen
- `offen` — geschlechtsübergreifend

### `RankingEntry`

```typescript
export const rankingEntry = sqliteTable('ranking_entry', {
  id: integer('id').primaryKey({ autoIncrement: true }).$type<RankingEntryId>(),
  rankingId: integer('ranking_id').notNull()
    .references(() => ranking.id, { onDelete: 'cascade' }).$type<RankingId>(),
  memberId: integer('member_id').notNull()
    .references(() => member.id, { onDelete: 'cascade' }).$type<MemberId>(),
  position: integer('position').notNull(),       // 1-basiert, lückenlos
  points: integer('points'),                     // null außerhalb points-table
  eloRating: real('elo_rating'),                 // null außerhalb elo/hybrid
  lastMatchAt: integer('last_match_at', { mode: 'timestamp' }),
}, (t) => [
  uniqueIndex('re_ranking_member_idx').on(t.rankingId, t.memberId),
  index('re_ranking_position_idx').on(t.rankingId, t.position),
])
```

### `RankingConfig` (Type-Container)

```typescript
export type RankingConfig = {
  maxJumpUp?: number        // Pyramid: max. Plätze nach oben (Spec Anhang A: 3)
  kFactor?: number          // ELO: K-Faktor (Standard 32)
  pointValues?: {           // Points-Tabelle: Spielpunkt-Defaults aus N-01
    challengeWin: number    // 3
    challengeLoss: number   // 1
    friendlyWin: number     // 2
    friendlyLoss: number    // 1
    friendlyNoResult: number// 1
    walkoverWin: number     // 2
    diversityBonus: number  // 1
  }
}
```

In diesem Feature werden Defaults gesetzt — verwendet (Pyramide-Sprung-Validierung, Punkte-Berechnung) werden sie in `challenges` und `results`.

### Migration

Eine neue Migration `0002_rankings.sql` via `pnpm db:generate`.

## Strategy-Pattern (ADR-006)

```typescript
// server/modules/rankings/strategy/types.ts
export type RankingMode = 'pyramid' | 'elo' | 'hybrid' | 'points-table'

export interface RankingStrategy {
  readonly mode: RankingMode

  /** Default-Config für eine neue Rangliste in diesem Modus. */
  defaultConfig(): RankingConfig

  /** Zod-Schema, das die Config dieses Modus validiert. */
  configSchema: ZodType<RankingConfig>

  /**
   * Anfangs-Reihenfolge: gibt die MemberIDs in End-Reihenfolge zurück.
   * Bekommt die `transitionStrategy` aus Season.config geliefert,
   * plus optional die Vorgänger-Rangliste (für takeover/softened).
   */
  getInitialOrder(input: InitialOrderInput): MemberId[]

  /**
   * Welche Felder werden bei einem neuen Eintrag initial gesetzt
   * (z. B. ELO-Rating = 1500, Points = 0).
   */
  initialEntryFields(member: MemberDto): Partial<RankingEntry>

  /** UI-Anzeige je Eintrag — primary („#5"), secondary („12 Pkt"). */
  getDisplayInfo(entry: RankingEntry): { primary: string; secondary?: string }
}
```

**Vier Implementierungen** in `server/modules/rankings/strategy/`:

- `pyramid.ts` — Position-basiert, Sprung-Distanz konfigurierbar
- `elo.ts` — Rating-basiert (Initial 1500), Position abgeleitet aus Rating-Ordnung
- `hybrid.ts` — Position + Rating beide gepflegt
- `points-table.ts` — Position aus akkumulierten Saison-Punkten (N-01)

In **diesem** Feature implementieren wir alle vier — aber die Strategy-Methoden, die für Match-Auswirkungen relevant sind (`validateChallenge`, `applyResult`), kommen erst mit `challenges` und `results`. Hier nur:
- `defaultConfig()`
- `configSchema`
- `getInitialOrder()`
- `initialEntryFields()`
- `getDisplayInfo()`

## Rangliste-Generierung beim Saison-Start

Beim Übergang `PLANNED → ACTIVE` (`POST /api/seasons/:id/start`):

1. Für jede AgeGroup der Saison:
   - genderRule `mixed` → 1 Rangliste (`variant=offen`)
   - genderRule `separate` → 2 Ranglisten (`herren`, `damen`)
   - genderRule `both` → 3 Ranglisten (`herren`, `damen`, `offen`)
2. Pro Rangliste: `mode` aus Season.config oder Default (Pyramide für Aktive,
   Punkte-Tabelle für Jugend/Altersklassen — siehe ADR-006)
3. Pro Rangliste: alle passenden Mitglieder eintragen
   (Geschlecht + Alter aus Geburtsjahr + AgeGroup-Bereich)
4. Initial-Reihenfolge via `strategy.getInitialOrder(...)`
5. `RankingEntry`-Insert mit `position` und Modus-spezifischen Initial-Feldern

Cross-Modul-Aufruf: das `seasons`-Modul muss beim Start `rankings.generateForSeason(seasonId)`
aufrufen. Wir erweitern den existierenden `seasonsService.start(...)` um diesen Hook.

## API-Endpoints (read-only)

| Methode | Pfad                          | Auth    | Zweck                                     |
|---------|-------------------------------|---------|-------------------------------------------|
| `GET`   | `/api/rankings`               | session | Liste mit Filter (seasonId, ageGroupId, variant) |
| `GET`   | `/api/rankings/:id`           | session | Detail mit Einträgen (memberId + position + display) |
| `GET`   | `/api/members/:id/rankings`   | session | Alle Rangliste-Plätze eines Mitglieds (FR-14) |

Schreibend (Konfig-Edit vor Saison-Start, Modus-Wechsel) ist **out of scope**
für dieses Feature — das gehört in eine spätere Admin-Erweiterung von `seasons`
oder einen eigenen `rankings-admin`-Step.

### Filter

```
GET /api/rankings?seasonId=1&ageGroupId=3&variant=herren&onlyActive=true
```

`onlyActive=true` filtert pausierte Mitglieder raus (FR-13).

## Cross-Modul-Aufrufe

| Aufrufer       | Aufgerufen   | Zweck                                                       |
|----------------|--------------|-------------------------------------------------------------|
| `seasons`      | `rankings`   | `generateForSeason(seasonId)` beim Saison-Start             |
| `rankings`     | `seasons`    | `findById(seasonId)` + `getAgeGroups`                       |
| `rankings`     | `members`    | `findById`, `listAll` (für Auto-Zuordnung)                  |

## UI-Skizze

### `/ranglisten` — Liste aller Ranglisten

```
┌────────────────────────────────────────────────────┐
│  Ranglisten              Saison: [Sommer 2026 ▼]  │
│                                                    │
│  Filter: [Alle Altersgruppen ▼] [Alle Varianten ▼] │
│                                                    │
│  Aktive Herren                       18 Spieler    │
│  Aktive Damen                        12 Spieler    │
│  Aktive Offen                        30 Spieler    │
│  U18 Offen                           14 Spieler    │
│  H40 Herren                          22 Spieler    │
│  ...                                               │
└────────────────────────────────────────────────────┘
```

Klick auf eine Zeile → Detail-Seite.

### `/ranglisten/[id]` — Detail

```
┌────────────────────────────────────────────────────┐
│  Aktive Herren · Sommer 2026                       │
│  Pyramide · 18 Spieler                             │
│                                                    │
│  #1   Max Müller         LK 8.3                    │
│  #2   Tim Schmidt        LK 9.1                    │
│  #3   Klaus Berger       LK 9.5                    │
│  ...                                               │
└────────────────────────────────────────────────────┘
```

Bei Points-Tabelle: zusätzliche Spalte „Punkte" rechts. Bei ELO/Hybrid:
zusätzliche Anzeige des Ratings als sekundär.

### Profil-Erweiterung (FR-14)

Auf `/profile` (kommt im nächsten Iteration-Schritt, in diesem PR nur API):
„Du bist in diesen Ranglisten: Herren #6 · Offen #12 · H40 #4"

## Initial-Reihenfolge-Strategien

`Season.config.transition` (Default `softened`):

- `takeover` — End-Position der Vorgängersaison übernehmen, neue Mitglieder ans Ende nach LK
- `reset` — alle nach LK sortieren (1.0 → 25.0)
- `softened` — Top 5 aus Vorgänger fix, Rest nach LK (Default, gemäß Spec Anhang A)

Modus-spezifisch:
- **Pyramide** nutzt alle drei
- **ELO/Hybrid** ignoriert `takeover`/`softened` (Rating ist die Wahrheit), nutzt nur `reset` (Rating auf 1500 zurücksetzen) oder behält Rating aus Vorgängersaison
- **Punkte-Tabelle** ignoriert alle drei (Punkte starten immer bei 0), sortiert nach LK als Tiebreaker

In dieser Iteration: **keine Vorgängersaison existiert**, also greift de facto immer „reset by LK" — die volle Transition-Logik kommt erst beim ersten Saison-Übergang in einer späteren Iteration.

## Validierung und Edge-Cases

- **Mitglied passt in keine AgeGroup**: kein Eintrag (kein Fehler — Admin kann
  später hand-zuordnen, oder Auto-Logik wird nachgepflegt)
- **Mitglied hat noch keine LK gesetzt**: Default 25.0 (FR-2a) — landet am Ende
- **Pausierter Spieler beim Saison-Start**: wird eingetragen, aber bei
  `onlyActive=true`-Filter unsichtbar (FR-25c)
- **Mehrere Saisons gleichzeitig aktiv**: Ranglisten existieren parallel, der
  Spieler steht in mehreren — das ist gewollt
- **Saison ohne AgeGroups starten**: erlaubt, generiert 0 Ranglisten — gut
  reproduzierbar für Tests
- **AgeGroup-Bereich-Logik**: `birthYear` aus Member, aktuelles Jahr - birthYear = Alter

## Tests

- **Unit**: jede Strategy isoliert (defaultConfig, configSchema, getInitialOrder, initialEntryFields)
- **Service**: `generateForSeason` mit verschiedenen AgeGroup-Konstellationen
  (mixed only, separate only, both, leer), Auto-Zuordnung der Member nach
  Alter und Geschlecht
- **Integration API**: GET-Endpoints mit Filter, ohne Session 401

## Modul-Schnitt-Eintrag in seasonsService.start

```typescript
// server/modules/seasons/service/seasons.ts
import { rankingsService } from '../../rankings'

start(id: SeasonId): SeasonDto {
  const updated = transition(id, 'PLANNED', 'ACTIVE', { startedAt: new Date() })
  rankingsService.generateForSeason(id)   // ← neuer Hook
  return updated
}
```

Wenn `generateForSeason` wirft, sollte der Aufruf in einer Transaktion mit
dem Status-Update sein. SQLite + Drizzle: wir wrappen in `db.transaction(...)`.

## Out of Scope für diesen Schritt

- Position-/Rating-/Punkte-**Änderungen** durch Match-Ergebnisse → `results`
- Challenge-Validierung („darf X den Y challengen?") → `challenges`
- Sprung-Regel-Anzeige im UI → `challenges`
- Manuelle Position-Korrektur (FR-63) → `admin`
- Saison-Übergang mit Vorgängersaison-Daten → folgt nach erstem Saison-Ende
- Wertungs-Modus-Wechsel pro Rangliste durch Admin → `admin`
- Mannschafts-Tags-Anzeige (FR-2g–i) → wenn Member-Directory kommt
- Spalten-Konfiguration durch Admin (FR-121) → `admin`

## Geklärte Punkte

Keine offenen Fragen. Defaults:

- Default-Modus pro Altersgruppe wie in ADR-006:
  - Jugend (`mixed`-AgeGroups) → Punkte-Tabelle
  - Aktive → Pyramide
  - Altersklassen (Über 40 / 50 / 60 …) → Punkte-Tabelle
- Initial-LK 25.0 (siehe `members`-Feature)
- ELO-Initial-Rating 1500, K-Faktor 32
- Pyramide max-Jump-Up 3
- Punkte-Tabelle-Defaultwerte aus N-01
