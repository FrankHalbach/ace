# Feature-Design-Doc: `<feature-name>`

**Status**: entwurf | in review | akzeptiert | implementiert
**Datum**: YYYY-MM-DD
**Modul**: `<modul-name>` (siehe [Architektur-Übersicht](../../architecture/overview.md))

## Ziel

Eine bis zwei Sätze: was wird gebaut und wofür? In Vereinssprache, nicht in
Technik-Sprache.

## Spec-Bezug

Welche FR-IDs aus [`spec-v1.0.html`](../../spec/spec-v1.0.html) sind hier
abgedeckt? Welche Nachträge aus [`nachtraege.md`](../../spec/nachtraege.md)?

| FR-ID / N-ID | Kurzbeschreibung                                  | Abgedeckt durch                     |
|--------------|---------------------------------------------------|-------------------------------------|
| FR-XX        | ...                                               | API-Endpoint / Service-Funktion / UI|

Ausdrücklich **nicht** abgedeckt von diesem Feature (verschoben oder out-of-scope):
- FR-YY — Grund

## Datenmodell

Welche Drizzle-Tabellen werden neu angelegt oder geändert? Felder, Indizes,
Constraints, FKs.

```typescript
// server/db/schema/<entity>.ts
export const entityName = sqliteTable('entity_name', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // ...
})
```

Branded-Types für IDs nicht vergessen (siehe Architektur-Übersicht § 2).

### Migrations

- Welche neuen Migrations entstehen?
- Gibt es Daten-Migration aus existierenden Tabellen?

## API-Endpoints

Pro Endpoint: Methode, Pfad, Auth-Anforderung, Request-Schema, Response-Schema.
Zod-Schemas leben in `<modul>/types.ts` und werden hier referenziert, nicht
ausgeschrieben.

| Methode | Pfad                              | Auth      | Zweck                                 |
|---------|-----------------------------------|-----------|---------------------------------------|
| `GET`   | `/api/<modul>/...`                | session   | ...                                   |
| `POST`  | `/api/<modul>/...`                | session   | ...                                   |

### Fehler-Fälle

Welche Error-Codes wirft das Feature?

| Code                       | HTTP | Bedeutung                                                  |
|----------------------------|------|------------------------------------------------------------|
| `member.not-found`         | 404  | ...                                                        |
| `member.visibility-denied` | 403  | Sichtbarkeits-Stufe verbietet Zugriff (FR-6)               |

## Cross-Modul-Aufrufe

Welche Service-Funktionen anderer Module ruft das Feature? Konsistent mit
[ADR-005](../../decisions/005-modul-schnitt.md).

| Aufgerufenes Modul | Service-Funktion                | Zweck                              |
|--------------------|---------------------------------|------------------------------------|
| `members`          | `findMemberById(id)`            | ...                                |

Werden eigene Service-Funktionen für andere Module bereitgestellt? Dann in
`<modul>/index.ts` exportieren.

## UI-Skizze

In Worten oder als ASCII-Skizze. Welche Seiten / Komponenten entstehen? Welche
existierenden Seiten ändern sich?

```
┌─────────────────────────────────────────┐
│  Rangliste · Herren U18                 │
├─────────────────────────────────────────┤
│  #1  Max Müller         LK 8.3   12 Pkt │
│  #2  Tim Schmidt        LK 9.1   10 Pkt │
│  ...                                    │
└─────────────────────────────────────────┘
```

- Mobile-First (NFR-1) — wie wirkt das auf kleinem Display?
- Wo greift Sichtbarkeit (FR-6)? Welche Felder sind je nach Stufe sichtbar?

## Hintergrund-Jobs

Falls das Feature einen Cron-Job einführt oder ändert: Frequenz, Owner-Modul,
Idempotenz-Strategie. Vergleiche [Architektur-Übersicht § 5](../../architecture/overview.md).

## Validierung und Edge-Cases

Eine Liste der Eingangs-Validierungen und der nicht-offensichtlichen Fälle, die
getestet werden müssen:

- Was, wenn der Spieler pausiert ist?
- Was, wenn der Spieler blockiert ist (FR-116)?
- Was bei Eltern-Kind-Routing für Spieler unter 14 (FR-40)?
- Rate-Limits (FR-110 ff.) anwendbar?

## Tests

- **Unit**: welche Service-Funktionen brauchen isolierte Tests?
- **Integration**: welche API-Endpoints werden gegen In-Memory-SQLite getestet?
- **Manuelle Smoke-Tests**: was wird vor jedem Release noch von Hand
  durchgeklickt?

## Offene Fragen

- ...

## Abhängigkeiten zu anderen Features

Was muss zuerst da sein, bevor dieses Feature implementierbar ist?

- `<feature-x>` wird vorausgesetzt (Begründung)

## Out of Scope für diesen Schritt

Was bewusst *nicht* mitgebaut wird, obwohl es nahe liegt:

- ...
