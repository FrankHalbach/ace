# 005 – Modul-Schnitt

**Status**: akzeptiert
**Datum**: 2026-05-14
**Entscheider**: Frank

## Kontext

Die Anwendung hat ~15 Haupt-Entities und etwa zehn fachlich klar abgrenzbare
Bereiche (Mitglieder, Saisons, Ranglisten, Challenges, …). Ohne explizite
Modul-Struktur entsteht über die Zeit ein „Big Ball of Mud": Repository-Aufrufe
aus dem Frontend, kreuz-und-quer-Imports, schwer zu testende Geschäftslogik.

TypeScript erzwingt keine Modul-Grenzen — die müssen wir durch Konvention und
Tooling herstellen. Gleichzeitig sind echte Microservices (eigene Prozesse,
Netzwerk-Calls) für die Größenordnung dieser Anwendung massiv überdimensioniert
(siehe ADR-001).

Außerdem zu entscheiden: ist KPI-/Badge-Berechnung ein eigenes Modul, oder ist es
ein Read-Model innerhalb `members`?

## Entscheidung

**Modularer Monolith** mit zwölf fachlichen Modulen, jedes mit einer expliziten
öffentlichen API.

### Module

```
auth · members · seasons · rankings · challenges · friendlies
results · suggestions · notifications · trainer · admin · stats
```

Modul-Zuständigkeiten und Abhängigkeiten siehe
[`docs/architecture/overview.md`](../architecture/overview.md) § 1 und § 4.

### Verzeichnis-Struktur pro Modul

```
server/modules/<name>/
├── index.ts        # Public API: re-exports der Service-Funktionen
├── api/            # Nitro-Routen (HTTP-Layer)
├── service/        # Geschäftslogik
├── repository/     # Drizzle-Queries, modul-intern
└── types.ts        # Public Types (DTOs, Branded IDs)
```

### Regeln für Cross-Modul-Aufrufe

1. **Imports zwischen Modulen gehen ausschließlich über `<modul>/index.ts`.**
   Direkter Zugriff auf `<modul>/repository/*` oder `<modul>/service/*` von außen
   ist verboten. Durchsetzung per ESLint-Regel (`no-restricted-imports`).

2. **Schreibende Operationen** laufen immer durch den Service des besitzenden
   Moduls. Niemand außer dem `challenges`-Modul schreibt in die `Challenge`-Tabelle.

3. **Lesende DB-Joins über Modul-Grenzen sind erlaubt**, wenn sie fachlich
   sinnvoll sind (z. B. `rankings × members` für Listen-Ansicht). Konkret:
   Read-Queries dürfen Drizzle-Tabellen anderer Module importieren, weil
   Read-Models sonst nur über N+1-Queries zusammenstellbar wären. Schreibende
   Statements bleiben modul-intern.

4. **Keine zyklischen Abhängigkeiten.** Wenn zwei Module sich gegenseitig
   aufrufen müssen, ist die Abstraktion falsch geschnitten und wird neu
   diskutiert.

5. **`auth` und `members` sind die zwei untersten Schichten** — sie dürfen von
   allen anderen Modulen importiert werden, importieren aber nichts ihrerseits
   außer `shared/`.

6. **`notifications` ist eine Senke.** Andere Module rufen `sendNotification(…)`
   auf, `notifications` ruft niemand zurück.

7. **Cross-Modul-Kommunikation ist synchron** (direkter Funktionsaufruf). Kein
   Event-Bus in v1.

### `stats` als eigenes Modul

`stats` ist ein **eigenes Modul, nicht Teil von `members`**, obwohl die
KPI-Berechnung über mehrere andere Module liest.

Begründung: KPIs und Badges hängen an Daten aus `challenges`, `results`,
`friendlies` und `rankings`. Sie in `members` zu legen würde dieses Modul zu
einem Sammelbecken machen und die Kern-Verantwortung (Profile, Sichtbarkeit,
Eltern-Kind) verwässern. Als eigenes, rein lesendes Modul bleibt `members`
schlank und `stats` ist klar als Read-Only-Layer erkennbar.

`stats` schreibt nichts in fremde Tabellen und besitzt ggf. eine eigene
Materialisierungs-Tabelle für teure Aggregationen (Entscheidung in der
Implementierung).

## Konsequenzen

### Positiv
- Klare Verantwortlichkeit pro Modul — leichter zu testen, zu reviewen, zu
  erklären
- Feature-Doc-First (siehe CLAUDE.md) passt natürlich auf den Modul-Schnitt
- ESLint-Regel erzwingt Grenzen ohne Run-Time-Overhead
- Späterer Wechsel einzelner Module zu eigenen Prozessen wäre möglich, falls
  jemals nötig — bleibt aber keine Roadmap-Vorgabe
- `stats` kann unabhängig optimiert/cachet werden, ohne `members` zu berühren

### Negativ
- Konvention statt Compiler — Verstöße werden nur durch ESLint und Code-Review
  abgefangen
- Mehr Indirektion: jeder Cross-Modul-Aufruf braucht eine Service-Funktion mit
  expliziter Signatur, kein direktes Repository-Hopping
- Lesende DB-Joins über Modul-Grenzen sind eine bewusste Aufweichung der
  Trennung — kann bei Schema-Änderungen in fremden Modulen zu kaskadierenden
  Anpassungen führen

### Neutral
- Bei sehr kleinen Features mit nur einem betroffenen Modul fühlt sich die
  Struktur leicht überdimensioniert an — ist im größeren Bild aber konsistent
- Tests werden modul-weise organisiert: `server/modules/<name>/__tests__/`

## Alternativen

### Alternative A: Flache Struktur ohne Module
Alles unter `server/api/`, `server/services/`, `server/repository/` in flachen
Ordnern. Funktioniert bis ca. 5 Entities, danach wird die Navigation mühsam und
fachliche Grenzen verwischen. Für 15 Entities zu wenig Struktur.

### Alternative B: Echte Microservices
Eigene Prozesse pro Modul, Netzwerk-Calls dazwischen. Massive Over-Engineering
für ~100 gleichzeitig aktive Nutzer. Operativ teurer, Deployment komplexer,
Latenzen entstehen wo vorher keine waren.

### Alternative C: Module nach Entity (eine Datei pro Tabelle)
`members/member.ts`, `members/parent-child-link.ts`, … Verfein­ert die Struktur
unter die fachliche Sinn-Einheit. Erschwert Refactorings, weil zusammengehörige
Logik künstlich getrennt wird.

### Alternative D: Event-driven Cross-Modul-Kommunikation
In-Process-Event-Bus mit Subscribers. Reduziert Kopplung *zwischen* Modulen, gibt
aber Type-Safety auf und erschwert Debugging (welcher Handler hat das Event
verarbeitet?). Kann in v2 nachgezogen werden, wenn ein konkretes Problem es
rechtfertigt — zum Beispiel asynchrone Side-Effects bei Ergebnis-Bestätigung.

### Alternative E: `stats` als Teil von `members`
Verlockend, weil KPIs am Profil hängen. Verwässert aber die `members`-Kern-
Verantwortung und vermischt Read-Models mit Stamm-Daten. Verworfen.

## Referenzen

- [`docs/architecture/overview.md`](../architecture/overview.md) — Modul-Liste,
  Abhängigkeiten, Cross-Modul-Schnittstellen
- ADR-001 (Tech-Stack) — Begründung gegen separate Backend-Prozesse
- CLAUDE.md § Datei-Struktur und § Modul-Schnitt
