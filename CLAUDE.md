# CLAUDE.md – Konventionen für Claude Code

Dieses Dokument ist die zentrale Anweisung an Claude Code für dieses Projekt.
Lies es zu Beginn jeder Session.

## Projekt-Kontext

**ass** ist eine interne Tennis-Vereinsplattform für den TuS Neureut.
Hauptzwecke: Rangliste mit Challenges, Vernetzung der Mitglieder über Freundschaftsspiele,
besondere Aktivierung der Jugendspieler. Etwa 500 Mitglieder, davon unter 100 gleichzeitig aktiv.

## Source of Truth

Die fachliche Spezifikation liegt in `docs/spec/spec-v1.0.html`.
Vor jeder Implementierungsfrage ist diese Spec zu konsultieren.
Bei Widersprüchen zwischen Spec und Code gewinnt die Spec, und der Widerspruch wird im Feature-Doc dokumentiert.

Fachliche Ergänzungen, die nach v1.0 entstanden sind, liegen in `docs/spec/nachtraege.md`.
Diese Nachträge sind verbindlich wie die Spec selbst, bis sie in eine Spec v1.1 einfließen.

## Tech-Stack

- **Nuxt 3** mit Vue 3 und TypeScript
- **Nitro Server Routes** als Backend (im gleichen Repo)
- **Drizzle ORM** mit SQLite (lokal und produktiv)
- **Nuxt UI** für Komponenten (auf Tailwind-Basis)
- **nuxt-auth-utils** für Magic-Link-Authentifizierung
- **Brevo** für Email-Versand

Begründungen siehe `docs/decisions/`.

## Konventionen

### Code-Stil

- **TypeScript überall**, aber pragmatisch: `strict: true` in `tsconfig.json`, jedoch `noImplicitAny` schrittweise einführen
- **Composition API mit `<script setup>`** in Vue-Komponenten; keine Options API
- **Funktionale Patterns bevorzugen**, aber kein Dogma — Lesbarkeit zählt
- **Domain Value Types** für IDs und Werteinheiten (z. B. `MemberId`, `SeasonId`) als Branded Types
- **Keine `any`-Types** außer in nachweislichen Ausnahmefällen mit Kommentar
- **Englisch** für Code und Code-Kommentare; **Deutsch** in UI und Dokumentation

### Datei-Struktur

```
app/
├── server/
│   ├── modules/           # Fachliche Module (members, seasons, challenges, ...)
│   │   └── <module>/
│   │       ├── api/       # HTTP-Endpoints (Nitro Routes)
│   │       ├── service/   # Geschäftslogik
│   │       ├── repository/# DB-Zugriff via Drizzle
│   │       └── types.ts   # Modul-spezifische Types
│   ├── db/
│   │   ├── schema/        # Drizzle-Schema (eine Datei pro Tabelle)
│   │   └── migrations/    # Drizzle Kit Migrations
│   └── shared/            # Modul-übergreifende Utilities
├── pages/                 # Vue-Seiten (Routing per Datei-Konvention)
├── components/            # Wiederverwendbare Vue-Komponenten
├── composables/           # Composition-API-Hooks
└── types/                 # Frontend-Types
```

### Modul-Schnitt

Jedes fachliche Modul (z. B. `challenges`, `rankings`, `members`) hat klare Grenzen.
Cross-Modul-Aufrufe gehen über definierte Service-Funktionen, nicht direkt auf Repositories anderer Module.
Datenbank-Joins über Modulgrenzen sind erlaubt, wenn fachlich sinnvoll — Pragmatismus vor Dogma.

### Datenbank und Migrations

- **Drizzle-Schema-First**: Schema in `server/db/schema/` definieren, Migrations daraus generieren mit `drizzle-kit generate`
- **Migrations sind unveränderlich** sobald gemerged. Korrekturen erfolgen über neue Migrations.
- **Keine raw SQL in Services**, außer für Performance-kritische Queries (mit Kommentar)
- **SQLite-Pragmas** korrekt setzen (`journal_mode=WAL`, `foreign_keys=ON`)

### API-Design

- **RESTful** für Standard-CRUD, **RPC-style** für Aktionen (`/api/challenges/:id/accept`)
- **Validation mit Zod**, Schemas in `<module>/types.ts`
- **Error-Format** einheitlich: `{ error: { code, message, details? } }`
- **Authentifizierung** via Session-Cookie, geprüft in einem zentralen Middleware

### Testing

- **Vitest** als Test-Runner
- **Unit-Tests für Services** mit jeglicher Geschäftslogik
- **Integration-Tests** für API-Endpoints, gegen In-Memory-SQLite
- **Keine End-to-End-Tests in v1**, aber strukturiert vorbereiten

### Frontend-Patterns

- **Pages dünn halten**, Logik in Composables
- **Komponenten klein**, ein klarer Zweck pro Komponente
- **Globaler State** nur wenn nötig (über `useState` von Nuxt), kein Pinia in v1
- **Forms validieren mit Zod** (gleiche Schemas wie Backend, geteilt über `shared/`)

## Workflow

### Design-Doc-First

Bevor ein Feature implementiert wird, entsteht ein Feature-Doc in `docs/features/<feature>/design.md`.
Das Doc beschreibt:
- Was wird gebaut (Verweis auf die FR-IDs aus der Spec)
- Datenmodell-Änderungen
- API-Endpoints
- UI-Skizze (in Worten oder als ASCII-Skizze)
- Offene Fragen

Erst nach Sichtung des Design-Docs wird implementiert.

### Plan Mode

Für jede nicht-triviale Code-Änderung wird Plan Mode genutzt (Shift+Tab zweimal in Claude Code).
Erst Plan, dann Umsetzung.

### Architectural Decision Records

Architekturentscheidungen werden in `docs/decisions/NNN-titel.md` festgehalten.
Format: Kontext, Entscheidung, Konsequenzen, Alternativen.
Sobald ein ADR akzeptiert ist, wird er nicht mehr geändert — Änderungen erfolgen durch neue ADRs.

### Commits

- **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Englisch oder Deutsch, aber konsistent pro Commit
- Kleine, fokussierte Commits

### Branch-Strategie

- `main` ist immer deploybar
- Feature-Branches: `feat/<feature-name>`
- Bei einfachen Änderungen direkt auf `main`

## Sicherheits-Grundregeln

- **Niemals echte Mitgliedsdaten** in Beispielen, Tests oder Commits
- **Magic-Link-Tokens** sind kryptographisch sicher (32+ Bytes Entropie)
- **Passwörter (falls eingeführt) gehasht** mit Argon2id, nie Klartext
- **DSGVO ernst nehmen**: keine personenbezogenen Daten in Logs, keine Tracking-Skripte
- **Eltern-Kind-Beziehungen** sauber prüfen vor Zugriff auf Kinder-Daten

## Out of Scope (siehe Spec § 7)

Folgendes wird in v1 **nicht** implementiert:
- Doppel-Ranglisten und ‑Challenges (Doppel nur als Freundschaftsspiel)
- Platzbuchung (bestehendes System)
- Mannschafts-/Medenspielverwaltung
- Turnierverwaltung
- Auto-Sync DTB-LK
- Live-Scoring
- Chat zwischen Spielern
- Web-Push (v2)
- Öffentliche Sichtbarkeit

Wenn Anforderungen aus diesen Bereichen kommen, **freundlich auf v2/v1.5 vertagen**.

## Nicht-Ziele für diese Codebase

- **Keine Over-Engineering**: kein Event-Sourcing, kein CQRS, keine Microservices, kein Kubernetes
- **Keine premature Optimization**: SQLite reicht, Caching erst wenn messbar nötig
- **Keine 100% Test-Coverage**: kritische Pfade testen, Rest auf Code-Review verlassen
- **Keine eigene Auth-Lib**: `nuxt-auth-utils` reicht und ist sauber
