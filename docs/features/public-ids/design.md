# Public-IDs für URLs — Full-GUID-Refactor

**Status**: Design — Implementierung folgt
**Datum**: 2026-05-16
**Berührte FR-IDs**: NFR-Sicherheit, kein konkreter FR

## Problem

URLs in ace leaken Sequential-Int-IDs:

- `/spieler/5`
- `/challenges/12`
- `/friendlies/8`
- `/ranglisten/3`
- `/admin/seasons/5`

Enumerierbar, leakt Vereinsgröße, wirkt unfertig. Pre-Launch.

## Entscheidung

Wir stellen die **Primary-Keys aller URL-exponierten Entitäten** von
`integer AUTOINCREMENT` auf **`text` mit `nanoid(10)`** um. Eine ID pro
Row, keine Hybrid-Doppelung.

Die Codebase nutzt durchgehend Branded-Types (`MemberId =
Brand<number, 'MemberId'>` etc.) — diese sind funktional TypeScript-
Value-Classes. Der Wechsel auf `Brand<string, …>` zieht sich
automatisch durch Services, Repos, DTOs ohne Stellen-für-Stellen-
Anpassung der Business-Logik. Genau das macht den Refactor handhabbar.

### Betroffene Entitäten

Die fünf URL-exponierten Tabellen bekommen Text-PKs. Die Foreign-Keys,
die auf diese PKs zeigen, **müssen mit-migriert werden** (SQLite
braucht passende Typen):

| Entity     | Eigene PK | Wer hat FK darauf                                       |
| ---------- | --------- | ------------------------------------------------------- |
| `member`   | text      | challenge.challenger_id/challenged_id, ranking_entry.member_id, match_result.winner_id/reported_by, match_points_award.member_id, friendly.initiator_id, friendly_invitee.member_id, friendly_result.reported_by/confirmed_by, magic_link_token.member_id |
| `ranking`  | text      | challenge.ranking_id, ranking_entry.ranking_id          |
| `challenge`| text      | match_result.challenge_id                               |
| `friendly` | text      | friendly_invitee.friendly_id, friendly_result.friendly_id |
| `season`   | text      | age_group.season_id, ranking.season_id                  |

`age_group`, `ranking_entry`, `match_result`, `friendly_result`,
`friendly_invitee`, `match_points_award`, `magic_link_token` behalten
**ihre eigene** Int-PK — sie sind nicht URL-exponiert. Nur ihre FKs
auf die fünf Top-Entitäten werden auf text umgestellt.

### Format

**Standard-nanoid: 21 Zeichen** aus `A-Za-z0-9_-` (~126 Bit Entropie).
Beispiel-Wert: `V1StGXR8_Z5jdHi6B-myT`.

Bewusst der Standard, **nicht 10 Zeichen**: Zod (v4) hat einen
eingebauten `z.string().nanoid()`-Validator, der exakt das
21-Zeichen-Format prüft. Damit fällt unser eigenes Regex weg, und alle
Body-Schemas haben durchgehend dieselbe semantische Validierung wie
unser Generator.

Drizzle generiert pro Insert via Default-Funktion. Schema:

```ts
id: text('id').primaryKey().$defaultFn(() => nanoid()).$type<MemberId>()
```

### Branded Types

| Bisher                            | Neu                                |
| --------------------------------- | ---------------------------------- |
| `MemberId = Brand<number, 'MemberId'>` | `MemberId = Brand<string, 'MemberId'>` |
| `ChallengeId`, `FriendlyId`, `RankingId`, `SeasonId` | analog |

Andere IDs (`AgeGroupId`, `RankingEntryId`, `MatchResultId`,
`FriendlyResultId`, …) bleiben `Brand<number, …>`.

### Sort-Code in Strategies

Drei Stellen sortieren aktuell mit `a.id - b.id` (Number-Subtraktion):
- `points-table.ts` — Tiebreaker bei Punkte/LK-Gleichheit
- `elo.ts` — Tiebreaker bei Rating-Gleichheit
- `pyramid.ts` — Reset-Sort über Member-Daten (`member.id - member.id`)

`pyramid.ts` arbeitet mit `MemberDto.id` (auch text nach Refactor).
Bei den anderen ist es `RankingEntryRow.id` — die bleibt int. Aber
die Sort sind im Member-Kontext nicht relevant für die Position; sie
geben nur eine deterministische Reihenfolge bei Gleichstand. Wir
ersetzen durch:

```ts
return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
```

Funktioniert für Strings wie für Numbers — kein Code-Bruch.

### Migration

Eine große Migration `0008_public_ids.sql` mit Table-Recreate pro
betroffener Tabelle (alle, deren PK oder FK sich ändert). SQLite-
Idiom (vgl. 0006).

Backfill für existierende Zeilen via `lower(hex(randomblob(8)))` —
16-Hex-String. Nicht das schöne nanoid-Alphabet, aber:
- Pre-Launch, keine Production-Daten
- `pnpm db:reset` regeneriert mit nanoid sauber

FK-Werte werden konsistent transformiert: wenn `member.id = 5` zu
`member.id = 'abcdef…'` wird, müssen alle FKs `member_id = 5` ebenfalls
zu `'abcdef…'` werden. SQL-seitig:

```sql
-- 1) member umstellen + Mapping merken
CREATE TEMP TABLE member_id_map (old_id INTEGER, new_id TEXT);
INSERT INTO member_id_map SELECT id, lower(hex(randomblob(8))) FROM member;

-- 2) FK-Spalten in jeder referenzierenden Tabelle vorbereiten (text)
-- 3) Werte über das Mapping umschreiben
-- 4) member selbst neu erzeugen mit text PK
```

Das ist viel SQL, aber mechanisch. Migration ist gross, aber einmalig.

### Schrittweise pro Entity

Wir migrieren in fünf PRs, einer pro Top-Entity:

1. **PR 1 — `member`** _(beginnen wir hier)_
   - `member.id` text + alle FKs darauf
   - Repos/Services/Routes/Frontend wo Member-ID URL-exponiert ist
   - Tests anpassen
2. **PR 2 — `ranking`**
3. **PR 3 — `challenge`**
4. **PR 4 — `friendly`**
5. **PR 5 — `season`**

Pro PR ein Drizzle-Migration-File. Reihenfolge wichtig: `member`
zuerst, weil `member.id` in den meisten anderen Tabellen als FK
hängt. `season` zuletzt, weil es FKs auf Member nicht hat.

Zwischen-Zustand: Mixed-Schema. `member.id = 'abc…'`, aber
`ranking.id = 5`. Das ist kurz und in sich konsistent — kein FK über
Typgrenzen.

### API-Param-Resolver

Aktuell: `requireIntParam(event, 'id')` parst zu `number`. Neu:
`requirePublicIdParam(event, 'id')` gibt `string` zurück. Die Service-
Methoden, die einen `MemberId` erwarten, akzeptieren jetzt eine
`Brand<string, 'MemberId'>` — der String wird per `as MemberId`
gecastet (am Eingang prüfen wir das per `findById`-Lookup; existiert
die ID nicht → 404).

### Tests

Tests, die `1 as MemberId` casten (Pre-existierende DB-Inserts mit
hartcodierten Werten), müssen auf reale Inserts umgestellt werden.
Tests, die IDs aus DB-Returns nehmen (`.returning().get().id`),
funktionieren ohne Anpassung — sie kriegen jetzt Strings statt Numbers.

Strategy-Tests, die `makeMember(1, 12)` mit Int-IDs nutzen: Brand-Cast
auf String, `makeMember('m1', 12)` analog. Genauso wie vorher, nur
String-Werte.

## Out of Scope

- `match_result`/`friendly_result`-IDs in API-Pfaden bleiben Int —
  sie sind nicht user-facing in Page-URLs. Eigenes PR wenn nötig.
- `age_group`-IDs bleiben Int — nur in API-Bodies, nie URL-exponiert.
- Customizable Public-IDs (User-Handles wie `@frank`) — anderes Feature.
