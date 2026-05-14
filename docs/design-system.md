# Design-System

**Status**: lebend (kein ADR — wird weiterentwickelt, sobald wir reale Screens haben)
**Letzte Änderung**: 2026-05-14

Dieses Dokument legt die visuelle Sprache von `ace` fest. Es dient als Grundlage
für Prototyping (Claude Design), für die Theme-Konfiguration in Nuxt UI und als
Referenz im Code-Review.

Source-of-Truth für Tokens (Single Source) ist später [`app.config.ts`](../app/app.config.ts).
Dieses Dokument erklärt die *Entscheidungen* hinter den Werten — Werte selbst
können auch ohne neue ADR-Diskussion verfeinert werden.

## 1. Visuelle Richtung

Die [Spec](spec/spec-v1.0.html) hat eine **editoriale Ästhetik**: Fraunces-Serif,
Cremepapier-Hintergrund, Tennisplatz-Grün als Primary, Court-Sand-Orange als
Accent. Sehr schön zum Lesen am Desktop.

Die App lebt aber auf dem **Handy am Platz, in der Sonne**. Daher:

- **Selbe Farbfamilie** wie die Spec — Wiedererkennung als TuS-Neureut-Plattform
- **Mehr Kontrast und reduzierte Wärme im Hintergrund** — Lesbarkeit bei
  direkter Sonneneinstrahlung
- **Sans-Serif im Body und in Headlines** — Fraunces nur für Marketing-Seiten,
  nicht in der App
- **Großzügige Touch-Targets** — Bedienung mit verschwitzten Tennisfingern auf
  einem kleinen Display
- **Tennisbälle gelb (`#dceb6b`) als optionaler Akzent** — wenn überhaupt, dann
  sehr sparsam, etwa für „neue Aktivität"-Badges

## 2. Farbpalette

### 2.1 Brand

| Token              | Hex       | Verwendung                                       |
|--------------------|-----------|--------------------------------------------------|
| `primary`          | `#2d5841` | Primärbutton, Aktiv-Status, Sieg                 |
| `primary-soft`     | `#e8efe8` | Hintergrund von Primary-Bereichen                |
| `primary-strong`   | `#1f3e2d` | Hover/Pressed auf Primary                        |
| `accent`           | `#b85c38` | Sekundär-Button, Hervorhebung, „neue Challenge"  |
| `accent-soft`      | `#f5e6dd` | Hintergrund von Accent-Bereichen                 |

### 2.2 Surface

| Token              | Hex       | Verwendung                                       |
|--------------------|-----------|--------------------------------------------------|
| `bg`               | `#fafaf7` | App-Hintergrund (heller als Spec, für Sonne)     |
| `bg-soft`          | `#f3f1e9` | Karten-Hintergrund, Listen-Untergrund            |
| `surface`          | `#ffffff` | Eingaben, Cards-Vordergrund, Modal-Bühne         |
| `rule`             | `#e0dcd0` | Trennlinien, Card-Borders                        |

### 2.3 Ink (Text)

| Token              | Hex       | Verwendung                                       |
|--------------------|-----------|--------------------------------------------------|
| `ink`              | `#1a1a1a` | Body-Text, Headings                              |
| `ink-muted`        | `#5a5a55` | Sekundär-Text, Meta-Daten                        |
| `ink-soft`         | `#8b8a82` | Hints, Disabled-Labels                           |
| `on-primary`       | `#fafaf7` | Text auf Primary-Hintergrund                     |
| `on-accent`        | `#fafaf7` | Text auf Accent-Hintergrund                      |

### 2.4 Status

Status-Farben werden semantisch verwendet, nicht ästhetisch. Sie sind so
gewählt, dass sie für die häufigsten Match- und Challenge-Zustände eindeutig
sind und für rot-grün-sehschwache Nutzer unterscheidbar bleiben (Hellwert plus
Hue).

| Token              | Hex       | Verwendung                                       |
|--------------------|-----------|--------------------------------------------------|
| `success`          | `#2d5841` | Bestätigt, Sieg, Aktiv (= `primary`)             |
| `info`             | `#4a6b8a` | Offene Challenge, neutraler Hinweis              |
| `warning`          | `#8a6d2c` | Frist läuft ab, Streitfall                       |
| `danger`           | `#a13c2a` | Ablehnung, Walk-over-Niederlage, Fehler          |
| `neutral`          | `#8b8a82` | Pausiert, Abgelaufen, Archiviert                 |

## 3. Status-Mapping für Challenge- und Match-States

Die Domäne hat klar definierte Zustände (siehe Spec § 6). Diese Tabelle ist
verbindlich — beide UI-Designer und Implementierung halten sich daran:

| Entity        | State         | Token-Farbe   | Pill-Label DE        |
|---------------|---------------|---------------|----------------------|
| Challenge     | `PROPOSED`    | `info`        | „Offen"              |
| Challenge     | `ACCEPTED`    | `accent`      | „Angenommen"         |
| Challenge     | `DECLINED`    | `danger`      | „Abgelehnt"          |
| Challenge     | `EXPIRED`     | `neutral`     | „Abgelaufen"         |
| Challenge     | `COMPLETED`   | `success`     | „Abgeschlossen"      |
| Challenge     | `DISPUTED`    | `warning`     | „Strittig"           |
| FriendlyMatch | `OPEN`        | `info`        | „Offen"              |
| FriendlyMatch | `CONFIRMED`   | `accent`      | „Bestätigt"          |
| FriendlyMatch | `COMPLETED`   | `success`     | „Gespielt"           |
| FriendlyMatch | `CANCELLED`   | `neutral`     | „Abgesagt"           |
| Member        | `aktiv`       | `success`     | „Aktiv"              |
| Member        | `pausiert`    | `neutral`     | „Pausiert"           |

## 4. Typografie

### 4.1 Font-Familien

- **Sans (`--font-sans`)**: `"Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  Body und Headings in der App. Sehr gut auf Mobile.
- **Mono (`--font-mono`)**: `"JetBrains Mono", "SF Mono", Consolas, monospace`
  IDs, LK-Werte, Match-Ergebnisse (z. B. `6:4, 3:6, 10:7`).
- **Serif (`--font-serif`)**: `"Fraunces", Georgia, serif`
  **Nicht in der App**. Reserviert für externe Doku, Marketing-Seiten.

### 4.2 Type-Skala

| Token         | px    | Verwendung                                        |
|---------------|-------|---------------------------------------------------|
| `text-xs`     | 12    | Pills, Meta-Labels, Captions                      |
| `text-sm`     | 14    | Body-Sekundär, Hints                              |
| `text-base`   | 16    | Body                                              |
| `text-lg`     | 18    | Listen-Items, große Buttons                       |
| `text-xl`     | 22    | Card-Titles, kleine Headings                      |
| `text-2xl`    | 28    | Page-Title (mobil)                                |
| `text-3xl`    | 36    | Page-Title (desktop), Hero                        |

Line-Heights: Body bei `1.5`, Headings bei `1.2`.

Font-Weights:
- `400` (regular) für Body
- `500` (medium) für Hervorhebung
- `600` (semibold) für Headings und Pills
- `700` reserviert (Sondernutzung)

## 5. Spacing und Sizing

Standard-Tailwind-Skala (`0.25rem`-Schritte). Konkrete Regeln:

- **Page-Padding mobil**: `1rem` (16px) seitlich
- **Card-Padding**: `1rem` (16px) bis `1.5rem` (24px) je nach Hierarchie
- **Section-Abstand**: `2rem` (32px) zwischen großen Blöcken
- **List-Item-Höhe**: mind. `3rem` (48px) für Touch

## 6. Touch und Mobile-First

- **Minimaler Touch-Target: 44 × 44 px** (Apple HIG, WCAG-AAA)
- **Abstand zwischen tappbaren Elementen: mind. 8 px**
- **Primary-Aktion „unten rechts"** auf Detail-Seiten (Daumen-Reichweite)
- **Forms mit großen Eingabefeldern**, `font-size ≥ 16 px` (iOS zoomt sonst auf
  Focus)
- **Keine Hover-only-Interaktionen** — alles auch per Touch erreichbar

## 7. Komponenten-Tokens

| Token              | Wert          | Verwendung                                  |
|--------------------|---------------|---------------------------------------------|
| `radius-sm`        | `0.25rem`     | Tags, Pills, kleine Buttons                 |
| `radius-md`        | `0.5rem`      | Standard-Buttons, Inputs                    |
| `radius-lg`        | `0.75rem`     | Cards, Modals                               |
| `radius-full`      | `9999px`      | Avatare, Status-Dots                        |
| `shadow-sm`        | leicht        | Hovered Cards                               |
| `shadow-md`        | mittel        | Hervorgehobene Cards (eigene Position)      |
| `shadow-lg`        | stark         | Modals, Drawer                              |
| `transition`       | `150ms ease`  | Hover-, Focus-, State-Übergänge             |

## 8. Beispiele in Worten

### Rangliste-Eintrag (mobil)

```
┌──────────────────────────────────────────────────┐
│ #5    Max Müller                  LK 8.3   12 Pkt│
│       Aktive Herren · 2 Matches/4 Wo             │
└──────────────────────────────────────────────────┘
```

- `#5` in `mono`, `ink-muted`, links bündig
- Name in `text-lg`, `font-medium`, `ink`
- `LK 8.3` als Pill in `bg-soft`, `mono`, `text-xs`
- `12 Pkt` in `mono`, rechts bündig, `primary`-Farbe
- Meta-Zeile (Klasse · Aktivität) in `text-sm`, `ink-muted`
- Touch-Target gesamt: 64 px Höhe

### Challenge-Status-Pill

```
[Offen]            ← bg: info-soft, text: info, radius-full, text-xs
[Angenommen]       ← bg: accent-soft, text: accent
[Strittig]         ← bg: warning-soft, text: warning
```

## 9. Verwendung in Nuxt UI

Nuxt UI 4 erlaubt globales Theme-Override via `app.config.ts`. Beispiel-
Mapping (nicht final):

```typescript
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'tennis-green',
      neutral: 'warm-stone',
    },
    button: {
      defaultVariants: { color: 'primary', size: 'lg' },
    },
    // …
  },
})
```

Die Custom-Farben (`tennis-green`, `warm-stone`) werden in `tailwind.config`
als Palette mit 50–950-Skala definiert und mit den Tokens oben verknüpft.

## 10. Was hier (noch) nicht steht

- Icon-Set (entscheiden, sobald wir erste Screens designen — Heroicons oder
  Lucide sind die heißesten Kandidaten)
- Dark Mode (out of Scope für v1, aber Tokens sind so benannt, dass eine
  spätere Dark-Variante möglich ist)
- Animations-Sprache (kommt mit der ersten interaktiven Komponente)
- Illustrations / Empty-States (entstehen organisch)
