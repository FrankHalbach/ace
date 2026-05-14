# ace

Interne Web-Plattform für den TuS Neureut, Tennisabteilung.
Rangliste, Challenges und Vernetzung – mit Fokus auf Jugendaktivierung.

## Status

In Entwicklung. Aktueller Stand: Spezifikation v1.0 fertig, Architektur dokumentiert,
Implementierung noch ausstehend.

## Spezifikation

Die vollständige funktionale Spezifikation liegt in [`docs/spec/spec-v1.0.html`](docs/spec/spec-v1.0.html).
Diese ist die **Source of Truth** für alle fachlichen Fragen.

## Tech-Stack

- **Framework**: Nuxt 3 (Vue 3 + TypeScript, Full-Stack über Nitro Server Routes)
- **UI**: Nuxt UI (auf Tailwind-Basis)
- **Datenbank**: SQLite (lokal und produktiv)
- **ORM**: Drizzle
- **Auth**: `nuxt-auth-utils` mit Email-Magic-Link
- **Email-Versand**: Brevo (300 Mails/Tag kostenlos, EU-gehostet)
- **Hosting**: Phasen-Strategie (lokal → Fly.io Demo → Produktion TBD, siehe ADR-004)
- **CI/CD**: GitHub Actions

Details und Begründungen in [`docs/decisions/`](docs/decisions/).

## Repository-Struktur

```
ace/
├── docs/
│   ├── spec/              # Funktionale Spezifikation (Source of Truth)
│   ├── architecture/      # Architektur-Übersicht, Modulschnitt
│   ├── decisions/         # Architectural Decision Records (ADRs)
│   └── features/          # Design Docs pro Feature (vor Implementation)
├── app/                   # (kommt: Nuxt-Anwendung)
├── CLAUDE.md              # Konventionen für Claude Code
└── README.md
```

## Dokumentation

- [`docs/spec/spec-v1.0.html`](docs/spec/spec-v1.0.html) — fachliche Spezifikation
- [`docs/spec/nachtraege.md`](docs/spec/nachtraege.md) — Spec-Erweiterungen seit v1.0
- [`docs/architecture/overview.md`](docs/architecture/overview.md) — Modul-Schnitt, Datenmodell, API-Bereiche, Auth-Flow
- [`docs/decisions/`](docs/decisions/) — Architectural Decision Records
- [`docs/features/`](docs/features/) — Feature-Design-Docs (entstehen vor jeder Implementierung)
- [`CLAUDE.md`](CLAUDE.md) — Code-Konventionen und Workflow

## Setup (sobald die App existiert)

```bash
# Voraussetzungen: Node.js 20+, pnpm
pnpm install
pnpm dev
```

Detaillierte Anweisungen folgen, sobald die App-Struktur steht.

## Lizenz

Noch keine öffentliche Lizenz festgelegt. Das Repository ist als interne Plattform
für den TuS Neureut konzipiert; Code-Lektüre und Fork sind willkommen.
