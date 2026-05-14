# 001 – Tech-Stack: Nuxt 3 Full-Stack

**Status**: akzeptiert
**Datum**: 2026-05-11
**Entscheider**: Frank

## Kontext

Für die Tennis-Vereinsplattform "ass" muss ein Tech-Stack gewählt werden.
Constraints:

- Etwa 15 Entities, überwiegend CRUD mit moderater Geschäftslogik
- ~500 Mitglieder, unter 100 gleichzeitig aktiv
- Mobile-first, primäre Nutzung am Platz auf dem Handy
- Solo-Entwicklung, gelegentliche Mitarbeit
- Möglichst niedrige laufende Kosten (Vereinsbudget)
- DSGVO-konform, EU-Hosting
- Schnelle Iteration vom ersten Mockup bis zu produktivem Stand

## Entscheidung

**Nuxt 3 mit Vue 3 und TypeScript als Full-Stack-Lösung.**
Backend als Nitro Server Routes im gleichen Repository.

## Konsequenzen

### Positiv
- Eine Sprache (TypeScript) im gesamten Stack senkt kognitive Last und Kontextwechsel
- Vue 3 mit Composition API ist nahe an Vanilla-JavaScript, geringe Einstiegshürde
- Nuxt liefert Routing, SSR, Auth-Integration, Build-Setup und API-Layer out of the box — wenig Glue-Code
- Schlanke Infrastruktur: ein Prozess, eine Codebase, ein Deployment
- Hosting auf einem kleinen VPS für wenige Euro pro Monat möglich
- Reichhaltiges Ökosystem (Nuxt UI, nuxt-auth-utils, drizzle-nuxt) deckt die Kernanforderungen ab

### Negativ
- Full-Stack-Frameworks koppeln Frontend und Backend stärker als getrennte Deployments — Migration einzelner Teile später aufwändiger
- Bei deutlichem Wachstum (mehr Module, höhere Last) müsste der Modul-Schnitt strenger durchgesetzt werden, da TypeScript keine harten Modul-Grenzen erzwingt
- SSR-Hydration kann subtile Bugs erzeugen, die im klassischen SPA nicht existieren

### Neutral
- Domain-Driven-Design ist über Ordnerstruktur und Service-Grenzen möglich
- Test-Setup ist mit Vitest in Nuxt unkompliziert

## Alternativen

### Alternative A: Klassisches Backend (Spring Boot, Express, FastAPI) + separates Frontend
- Klarere Trennung, mehr Flexibilität bei Skalierung
- Für die Größenordnung dieser Anwendung überdimensioniert: zwei Deployments, zwei Build-Pipelines, doppelter Auth-Setup
- Höherer Infrastruktur-Aufwand bei minimalem Mehrwert

### Alternative B: SvelteKit oder Remix
- Funktional vergleichbar mit Nuxt
- Kleineres Ökosystem im Vergleich zu Vue/Nuxt
- Keine zwingenden Vorteile für dieses Profil

### Alternative C: Vanilla Vue + Express + ORM
- Mehr Flexibilität, aber auch deutlich mehr Glue-Code
- Routing, SSR, Auth-Integration müssten manuell zusammengesetzt werden

## Referenzen

- Spec: `docs/spec/spec-v1.0.html`
- Verwandte ADRs: 002 (Datenbank), 003 (Auth)
