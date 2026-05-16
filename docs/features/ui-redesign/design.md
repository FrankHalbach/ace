# Feature-Design-Doc: `ui-redesign-foundation`

**Status**: Foundation umgesetzt, Screen-Migrationen offen
**Datum**: 2026-05-16
**Modul**: app-weit

## Ziel

Die in [`docs/design-system.md`](../../design-system.md) spezifizierte
visuelle Sprache von `ace` ist in Code verankert. Screen-für-Screen-
Migrationen folgen als eigene, kleine PRs gegen diese Foundation.

## Was diese Iteration enthält (umgesetzt)

1. **[`app/assets/css/tokens.css`](../../../app/assets/css/tokens.css)** — alle
   Brand-/Surface-/Status-/Type-/Spacing-/Radius-/Shadow-Tokens als CSS-
   Variablen, gesourced aus dem Claude-Design-Bundle
2. **Font-Loading** (Source Sans 3 + JetBrains Mono via Google-Fonts-CDN)
   in `tokens.css`. Fraunces ist bewusst **nicht** geladen — pro
   `design-system.md` §4.1 nur für Marketing
3. **Tailwind-4-`@theme`-Block** in
   [`app/assets/css/main.css`](../../../app/assets/css/main.css) mit den
   Paletten `tennis-green`, `court-clay`, `warm-stone` (50–950, verankert
   auf den Token-Hexes)
4. **[`app/app.config.ts`](../../../app/app.config.ts)** umgestellt auf
   `tennis-green` / `court-clay` / `warm-stone` statt Tailwind-Stock-
   `emerald` / `orange` / `stone`
5. **CLAUDE.md** um Design-Section ergänzt, die die drei Token-Stellen
   und das externe Design-Bundle referenziert

## Was bewusst weggelassen wurde (eigene PRs danach)

- **Pro-Screen-Redesign** — jede Page (Home, Ranglisten-Index, Ranglisten-
  Detail, Challenges-Liste/-Detail, Friendlies-Liste/-Detail, Spieler-
  Profil, Trainer, Admin, Profile-Edit, Login) bekommt ihren eigenen
  fokussierten Refactor-Commit gegen die neuen Tokens.
  Empfohlene Reihenfolge nach Sichtbarkeit:
  1. Home (`/`) — meistbenutzt
  2. Ranglisten-Detail (`/ranglisten/[id]`) — visuell komplexeste Tabelle
  3. Challenges-Liste (`/challenges`)
  4. Spieler-Profil (`/spieler/[id]`)
  5. Rest in lockerer Reihenfolge

- **Wiederverwendbare Primitive-Komponenten** (`StatusPill.vue`, `LkChip.vue`,
  `MemberRow.vue`) — entstehen organisch beim ersten Screen-Pass, der
  einen wiederkehrenden Pattern braucht. Vorher zu bauen wäre
  spekulativ.

- **`/styleguide`-Page im App-Build** — kann später als Live-Reference
  hinzukommen; aktuell deckt das externe Design-Bundle (mit 20+ Preview-
  Cards) diese Rolle ab, fetchbar via
  `https://api.anthropic.com/v1/design/h/OUCieZQIaumDGKHCST1saA`

- **`SeasonStatusBadge` → generische `StatusPill`-Migration** — kommt mit
  dem ersten Screen-Pass, der eine neue Pill-Variante braucht

- **Vendoring der Font-Dateien** (`.woff2` lokal statt Google-Fonts-CDN) —
  vor Mitglieder-Launch entscheiden; aktuell CDN-Substitution

- **Custom-Paletten für Status-Farben** (`court-cyan` für info,
  `clay-ochre` für warning, `terracotta` für danger) — erst, wenn
  Tailwind-Stock (`slate`/`amber`/`red`) den Status-Pill-Look verfehlt

- **Dark Mode** — explizit out of Scope für v1 pro `design-system.md` §10

## Verifikation

- `pnpm dev` startet, Home-Page rendert mit den neuen Tokens
- Buttons (Challenge / Friendly), Status-Pills, Cards visuell gegen das
  externe Design-Bundle gegengecheckt
- Mobil-Viewport (DevTools 375 px) — keine Layout-Brüche

## Risiken / Tradeoffs

- **Bestehende Pages sehen visuell anders aus** als vor dieser
  Foundation-PR (grüner emerald → tennis-green, andere Fonts, andere
  warm-stone-Grautöne). Bewusst akzeptiert — die Foundation soll greifen
- **Paletten-Stufen 100–400 / 600–950 sind interpoliert**, nicht designed.
  Bei sichtbaren Quirks (z. B. zu dunkler Hover-State auf einem Button)
  nachjustieren in `main.css` `@theme`-Block
- **Status-Pills hängen heute auf Tailwind-Stock** — wirken evtl. nicht
  ganz harmonisch zur warmen Brand-Palette. Bei Bedarf eigene Paletten
  bauen
