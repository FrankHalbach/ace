# Feature-Design-Proposal: `ui-redesign · home`

**Status**: Proposal — wartet auf Sichtung
**Datum**: 2026-05-17
**Modul**: app-weit (Home als erster Screen-Pass)
**Preview**: [`preview/home.html`](preview/home.html) — eigenständig im Browser öffnen, responsive

## Auslöser

Akute Reibung: Auf Desktop rutscht der **Schnellzugriff** bei vielen Einladungen
unter den Fold. Das ist nicht nur ein Layout-Bug — es ist ein IA-Bug:
*Schnellzugriff ist die einzige sichtbare Hauptnavigation auf Desktop*, weil der
Header heute nur Brand + Avatar trägt. Mobil ist das gleiche Problem implizit
gelöst (Bottom-Tab-Bar), aber die Schnellzugriff-Section dupliziert dort
trotzdem die Tabs.

## Vorschlag in einem Satz

Hauptnav in den Header (Desktop) heben, Schnellzugriff-Section ersatzlos
streichen, und den Home-Screen mit einer editorialen, dichteren visuellen
Sprache neu aufziehen, die zur bestehenden Token-Foundation passt.

## Die drei Bewegungen

### 1. IA: Schnellzugriff ist Navigation, nicht Content

| heute | neu |
|---|---|
| Desktop: nur Brand + Avatar im Header → Hauptnav als Kachel-Grid weit unten | Desktop: **Pill-Tabs im Header** (Start · Rangliste · Spiele · Trainer · Admin) mit Active-State und optionalem Badge für "Offen-Count" |
| Mobil: Bottom-Tab + redundantes Schnellzugriff-Grid | Mobil: **Bottom-Tab bleibt** (existiert schon), Schnellzugriff-Grid fällt weg |
| Trainer/Admin nur über Schnellzugriff erreichbar | Trainer/Admin als reguläre Header-Tabs, rollen-konditional eingeblendet |

**Effekt**: Primäre Navigation ist permanent erreichbar, unabhängig davon,
wie viele Einladungen offen sind. Der Home-Screen wird kürzer und kann sich
ganz auf Inhalt konzentrieren.

### 2. Visuell: editoriale Verdichtung statt Card-Mosaik

Das aktuelle Layout setzt schon stark auf Hairline-Listen statt Cards — gut.
Der Vorschlag verstärkt diese Richtung statt sie aufzuweichen:

- **Hero** großzügiger, Vorname kursiv in `--primary` (Source-Sans-3-Italic
  übernimmt die "warme Begrüßungs"-Rolle, ohne dass wir Fraunces ins
  App-Bundle ziehen müssen)
- **Stat-Strip** als Tennis-Scoreboard: Mono-Tabular, größer, dünne
  vertikale Hairlines zwischen den Werten
- **Section-Heads** mit kurzem orangenen Court-Line-Tick (statt nur Text)
  und Mono-Uppercase-Tracking — gibt der Seite Rhythmus und macht klar,
  dass eine neue Sektion beginnt
- **"Als nächstes"-Hero-Card** ganz oben: das nächste geplante Match wird
  aus der `Geplant`-Liste herausgehoben, mit Datechip, Court-Line-Akzent
  am oberen Rand und Countdown-Kicker ("In 2 Tagen · 18:00"). Macht
  visuell sofort klar: das ist das nächste konkrete Tennis-Ereignis
- **Date-Chips** mit Mono-Tabular für `Geplant`-Listenitems — sieht wie
  ein Spielplan im Match-Programm aus
- **"Neu"-Indikator** mit kleinem Tennis-Ball-Yellow-Punkt — sparsam,
  nur für ungesehene/neue Items

### 3. Mikro-Polish

- Subtile Stagger-Animation beim Load (kurz, ~600ms, mit
  `prefers-reduced-motion`-Respekt)
- Pulse am "In X Tagen"-Kicker des nächsten Matches
- Hover-Indent (4px) auf Listenitems statt nur Background-Tint — fühlt
  sich physischer an
- Header-Bottom-Border nutzt `backdrop-filter` für glaubwürdige
  Übersetzung von Sticky bei Scroll

## Was die Preview demonstriert

[`preview/home.html`](preview/home.html) ist eigenständig — keine Build-
Tools, nur Source-Sans-3 + JetBrains-Mono via Google-Fonts-CDN (wie die
App heute). Die Datei rendert mobile-first und schaltet bei ≥ 768 px in
die Desktop-Variante mit Header-Nav.

**Was geprüft werden sollte:**

1. Wirkt die editoriale Richtung mit Source Sans 3 stark genug, oder
   muss Fraunces doch in die App? (`design-system.md` §4.1 erlaubt
   Fraunces aktuell nur für Marketing)
2. Trifft der Court-Line-Tick vor Section-Heads das richtige Gewicht?
3. Ist die "Als nächstes"-Hero-Card eine Verbesserung oder doppelt sie
   nur Information aus `Geplant`?
4. Header-Nav auf Desktop: Pills wie im Mockup, oder lieber dezenter
   (Underline-Style)? Bei 5 Items mit Trainer/Admin wird's gedrängt
5. Tennis-Ball-Yellow als "Neu"-Indikator — sparsam genug?

## Was bewusst NICHT in dieser Iteration ist

- Dark Mode (per `design-system.md` §10 out of Scope für v1)
- Status-Pill-Variants für die anderen Screens (kommt mit dem
  jeweiligen Screen-Pass)
- Wiederverwendbare Vue-Komponenten (`SectionHead.vue`, `EditorialList.vue`,
  `DateChip.vue`) — werden aus dem ersten Vue-Pass herausgezogen, nicht
  spekulativ vorgebaut
- Andere Screens (Ranglisten-Detail, Challenges-Liste etc.) — Home zuerst,
  Pattern dort einschwingen lassen

## Risiken / Tradeoffs

- **Header-Nav mit 5 Items wird auf ~1024 px gedrängt**. Bei 768 px ist
  schon eng. Fallback: Trainer/Admin im Avatar-Dropdown halten, Header
  nur Start · Rangliste · Spiele
- **"Als nächstes"-Hero-Card duplizit Information**, wenn der nächste
  Termin auch in `Geplant` auftaucht. Lösung: ersten `Geplant`-Eintrag
  in den Hero promoten, `Geplant`-Liste startet erst beim zweiten Termin
- **Italics in Source Sans 3** sind ok, aber nicht spektakulär. Wenn das
  zu zahm wirkt, ist Fraunces (oder ein anderes Editorial-Serif wie
  Tiempos / Lora / GT Sectra) ein eigener Entscheidungspunkt für ein
  ADR

## Nächste Schritte (nach Sichtung)

1. Entscheidungen zu den fünf Prüf-Fragen oben
2. Implementierungs-Plan: Header-Nav-Komponente neu, `index.vue`
   restrukturieren, Schnellzugriff-Section entfernen, neue Primitives
   (`SectionHead`, `DateChip`, evtl. `NextMatchHero`) als kleine Vue-SFCs
3. PR `feat/ui-home-redesign` gegen `master`, klein gehalten — nur Home,
   andere Screens danach in Folge-PRs gegen die hier etablierten Patterns
