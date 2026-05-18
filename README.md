# ace

Interne Web-Plattform für den TuS Neureut, Tennisabteilung.
Rangliste, Challenges und Vernetzung – mit Fokus auf Jugendaktivierung.

## Status

In aktiver Entwicklung. Spezifikation v1.0 abgeschlossen, Kern-Module (Members, Auth,
Seasons, Challenges, Rankings, Friendlies, Results, Suggestions, Trainer) implementiert.
UI-Redesign-Pass und letzte Pre-Launch-Themen (Admin-Feature, Schedule-Konflikte) stehen
vor dem Mitglieder-Launch noch aus.

## Spezifikation

Die vollständige funktionale Spezifikation liegt in [`docs/spec/spec-v1.0.html`](docs/spec/spec-v1.0.html).
Diese ist die **Source of Truth** für alle fachlichen Fragen.
Ergänzungen seit v1.0 stehen in [`docs/spec/nachtraege.md`](docs/spec/nachtraege.md).

## Tech-Stack

- **Framework**: Nuxt 4 (Vue 3 + TypeScript, Full-Stack über Nitro Server Routes)
- **UI**: Nuxt UI 4 (auf Tailwind 4)
- **Datenbank**: SQLite via `better-sqlite3` (lokal und produktiv)
- **ORM / Migrations**: Drizzle ORM + Drizzle Kit
- **Auth**: `nuxt-auth-utils` mit Email-Magic-Link
- **Email-Versand**: Brevo (300 Mails/Tag kostenlos, EU-gehostet)
- **Validation**: Zod (gleiche Schemas Backend/Frontend)
- **Tests**: Vitest
- **Lint**: ESLint (`@nuxt/eslint`) + Prettier
- **Hosting**: Phasen-Strategie (lokal → Fly.io Demo → Produktion TBD, siehe ADR-004)
- **CI/CD**: GitHub Actions

Details und Begründungen in [`docs/decisions/`](docs/decisions/).

## Voraussetzungen

Folgende Tools müssen installiert sein, bevor das Projekt lokal läuft:

| Tool | Version | Zweck |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) | **≥ 20.x** (LTS empfohlen) | Runtime für Nuxt/Nitro und Tooling |
| [pnpm](https://pnpm.io/installation) | **≥ 9.x** | Paket-Manager (npm/yarn werden nicht unterstützt) |
| [Git](https://git-scm.com/) | aktuell | Repo-Zugriff |
| Build-Tools für `better-sqlite3` | siehe unten | Native-Modul-Compile beim ersten `pnpm install` |

**Native-Compile-Tools für `better-sqlite3`:**

- **Windows**: Visual Studio Build Tools mit C++-Workload (oder beim Node-Installer „Tools for Native Modules" anhaken)
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `build-essential`, `python3`

Alle weiteren Abhängigkeiten (Drizzle Kit, Vitest, ESLint, Nuxt, …) werden über `pnpm install` lokal in `node_modules/` installiert. Es ist **nichts global** zu installieren.

## Setup

### 1. Repository klonen und Abhängigkeiten installieren

```bash
git clone https://github.com/FrankHalbach/ace.git
cd ace
pnpm install
```

`pnpm install` löst auch `nuxt prepare` (postinstall) aus und kompiliert `better-sqlite3` nativ.

### 2. Environment-Datei anlegen

```bash
cp .env.example .env
```

Dann `.env` editieren und ausfüllen:

| Variable | Pflicht | Beschreibung |
| --- | --- | --- |
| `NUXT_SESSION_PASSWORD` | ja | 32+ Bytes Zufallsstring für Session-Cookie. Generieren: `openssl rand -base64 32` |
| `NUXT_BREVO_API_KEY` | für Mail-Versand | API-Key aus [Brevo](https://app.brevo.com) → SMTP & API |
| `NUXT_DB_PATH` | nein | Pfad zur SQLite-Datei (Default `./data/ace.db`) |
| `NUXT_PUBLIC_BASE_URL` | ja | Lokal `http://localhost:3000`, Demo/Prod entsprechend |
| `NUXT_AUTH_MAGIC_LINK_LIMIT_PER_HOUR` | nein | Magic-Link-Rate-Limit pro Email/Stunde (Default lokal 100) |

Ohne `NUXT_BREVO_API_KEY` läuft die App, aber Magic-Links werden nicht per Mail versendet. Für lokale Logins gibt es stattdessen `pnpm db:login` (siehe unten).

### 3. Datenbank initialisieren

```bash
pnpm db:migrate     # legt data/ace.db an und spielt alle Drizzle-Migrationen ein
pnpm db:seed        # befüllt mit Beispiel-Daten (optional, nur für lokale Entwicklung)
```

### 4. Dev-Server starten

```bash
pnpm dev
```

Die App ist dann unter [http://localhost:3000](http://localhost:3000) erreichbar.

### 5. Lokaler Login ohne Mail-Versand

```bash
pnpm db:login <email>
```

Gibt eine Magic-Link-URL auf der Konsole aus, die im Browser geöffnet werden kann.
Bypasst Rate-Limit und Brevo komplett — nur für lokale Entwicklung.

## pnpm-Scripts im Überblick

| Script | Beschreibung |
| --- | --- |
| `pnpm dev` | Nuxt-Dev-Server mit HMR |
| `pnpm build` | Produktions-Build |
| `pnpm preview` | Build-Preview |
| `pnpm generate` | Static Generation (für Demos) |
| `pnpm lint` | ESLint über das ganze Projekt |
| `pnpm test` | Vitest (Unit + Integration) |
| `pnpm db:generate` | Drizzle-Migration aus geänderten Schemas erzeugen |
| `pnpm db:migrate` | Pending-Migrationen anwenden |
| `pnpm db:seed` | Beispiel-Daten einspielen |
| `pnpm db:reset` | Datenbank löschen und neu aufsetzen |
| `pnpm db:studio` | Drizzle Studio (Web-UI für die DB) |
| `pnpm db:login <email>` | Lokalen Magic-Link für ein Mitglied erzeugen |

## Repository-Struktur

```
ace/
├── app/                   # Nuxt-Client (Vue-Komponenten, Pages, Composables)
│   ├── assets/css/        # Design-Tokens und Tailwind-Theme
│   ├── components/
│   ├── composables/
│   ├── pages/
│   └── app.config.ts      # Nuxt-UI-Theme-Tokens
├── server/                # Backend (Nitro)
│   ├── modules/           # Fachliche Module (members, challenges, rankings, ...)
│   ├── db/
│   │   ├── schema/        # Drizzle-Schema (eine Datei pro Tabelle)
│   │   └── migrations/    # Drizzle-Kit-Migrationen
│   ├── shared/            # Modul-übergreifende Utilities
│   └── tasks/             # Cron-Jobs (Nitro Scheduled Tasks)
├── shared/                # Code, der Backend und Frontend teilen (z. B. Zod-Schemas)
├── public/                # Statische Assets
├── data/                  # Lokale SQLite-Datei (nicht im Repo)
├── tests/                 # Vitest-Suiten
├── docs/
│   ├── spec/              # Funktionale Spezifikation (Source of Truth)
│   ├── architecture/      # Architektur-Übersicht, Modulschnitt
│   ├── decisions/         # Architectural Decision Records (ADRs)
│   ├── features/          # Design Docs pro Feature (vor Implementation)
│   └── design-system.md   # Visuelle Sprache, Tokens, Status-Mapping
├── nuxt.config.ts
├── drizzle.config.ts
├── eslint.config.mjs
├── vitest.config.ts
├── tsconfig.json
├── pnpm-workspace.yaml
├── CLAUDE.md              # Konventionen für Claude Code
└── README.md
```

## Dokumentation

- [`docs/spec/spec-v1.0.html`](docs/spec/spec-v1.0.html) — fachliche Spezifikation
- [`docs/spec/nachtraege.md`](docs/spec/nachtraege.md) — Spec-Erweiterungen seit v1.0
- [`docs/architecture/overview.md`](docs/architecture/overview.md) — Modul-Schnitt, Datenmodell, API-Bereiche, Auth-Flow
  ([HTML-Fassung mit Mermaid-Diagrammen](docs/architecture/overview.html))
- [`docs/design-system.md`](docs/design-system.md) — Visuelle Sprache, Farben, Typografie, Status-Mapping
- [`docs/decisions/`](docs/decisions/) — Architectural Decision Records
- [`docs/features/`](docs/features/) — Feature-Design-Docs (entstehen vor jeder Implementierung)
- [`CLAUDE.md`](CLAUDE.md) — Code-Konventionen und Workflow

## Troubleshooting

- **`better-sqlite3` schlägt beim Install fehl**: Build-Tools für die jeweilige Plattform installieren (siehe Voraussetzungen), dann `pnpm install` erneut ausführen. Notfalls `pnpm rebuild better-sqlite3`.
- **Magic-Link-Rate-Limit beißt lokal**: `NUXT_AUTH_MAGIC_LINK_LIMIT_PER_HOUR=100` in `.env` setzen oder `pnpm db:login` nutzen.
- **DB hängt nach Schema-Änderung**: `pnpm db:reset` setzt die lokale Datenbank zurück (Daten gehen verloren).
- **Port 3000 belegt**: `pnpm dev --port 3001` o. ä.

## Lizenz

Noch keine öffentliche Lizenz festgelegt. Das Repository ist als interne Plattform
für den TuS Neureut konzipiert; Code-Lektüre und Fork sind willkommen.
