# Architectural Decision Records

In diesem Ordner liegen alle bewussten Architektur-Entscheidungen
für das Projekt. Jeder ADR ist eine Momentaufnahme — einmal akzeptiert,
wird er nicht mehr geändert. Ändert sich die Entscheidung, entsteht
ein neuer ADR, der den alten ersetzt.

## Aktuelle ADRs

| Nr  | Titel                                  | Status          |
|-----|----------------------------------------|-----------------|
| 001 | Tech-Stack: Nuxt 3 Full-Stack          | akzeptiert      |
| 002 | Datenbank: SQLite mit Drizzle ORM      | akzeptiert      |
| 003 | Authentifizierung: Magic-Link via Email| akzeptiert      |
| 004 | Hosting und Deployment (Phasen)        | vorgeschlagen   |
| 005 | Modul-Schnitt                          | akzeptiert      |
| 006 | Wertungssystem-Strategie               | akzeptiert      |

## Neuen ADR anlegen

Kopiere `_template.md` und vergib die nächste freie Nummer.
Datum, Status und Entscheider ausfüllen.

## Warum ADRs?

ADRs sind kein Bürokratie-Werkzeug, sondern Erinnerungsstütze.
In sechs Monaten — wenn du dich fragst, warum die Datenbank SQLite
ist und nicht Postgres — gibt der ADR-002 die Antwort, inklusive
der damals verworfenen Alternativen. Das spart endloses Diskutieren
und „warum ist das eigentlich so?".
