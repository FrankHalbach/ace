# Feature-Design-Doc: `user-menu-theme`

**Status**: entwurf
**Datum**: 2026-05-15
**Modul**: keiner (rein UI/Layout, kein Server-Code)

## Ziel

Einheitlicher App-Header mit Avatar-basiertem User-Menu, in dem Theme-Mode
(light/dark/system) wählbar ist. Beseitigt zugleich die per-Page handgerollten
Header-Leisten („Willkommen, X" + Logout).

## Spec-Bezug

| ID    | Kurzbeschreibung                                  | Abgedeckt durch                       |
|-------|---------------------------------------------------|---------------------------------------|
| N-02  | Theme-Mode im User-Menu                           | `app/components/UserMenu.vue` + `useColorMode` |
| NFR-1 | Mobile-First                                      | Layout responsive, Menu als Popover  |

Keine FR-IDs direkt — N-02 (siehe `docs/spec/nachtraege.md`) ist der
spezifische Nachtrag.

## Datenmodell

Keine Änderungen. Theme-Persistenz übernimmt `@nuxt/ui` / `@nuxtjs/color-mode`
über LocalStorage des Browsers.

## API-Endpoints

Keine.

## UI-Skizze

### Default-Layout

```
┌──────────────────────────────────────────────────┐
│  ace · TuS Neureut                       [ 👤 ]  │ ← Avatar, klickbar
├──────────────────────────────────────────────────┤
│                                                   │
│  <Page-Content>                                   │
│                                                   │
└──────────────────────────────────────────────────┘
```

Klick auf Avatar öffnet Dropdown:

```
                                    ┌─────────────────┐
                                    │ Anna Admin      │
                                    │ admin · player  │
                                    ├─────────────────┤
                                    │ Mein Profil  →  │
                                    ├─────────────────┤
                                    │ Theme:          │
                                    │  ◯ Light        │
                                    │  ◯ Dark         │
                                    │  ◉ System       │
                                    ├─────────────────┤
                                    │ Logout          │
                                    └─────────────────┘
```

### Komponenten

- `app/components/UserMenu.vue` — Avatar + Dropdown (UDropdownMenu von Nuxt UI)
- `app/layouts/default.vue` — neues Default-Layout mit Header
- `app/composables/useThemeOptions.ts` (optional) — wenn die Theme-Items
  mehrfach gebraucht werden; sonst inline

Bestehende Pages werden auf das neue Layout migriert — handgerolle Header
(„Willkommen, X" + Logout-Button) raus, Page kümmert sich nur noch um den
eigentlichen Content. Login-Seiten (`/login`, `/login/check-email`) bleiben
ohne Layout-Header.

### Layout-Auswahl pro Page

| Pfad                  | Layout    | Begründung                          |
|-----------------------|-----------|-------------------------------------|
| `/login`, `/login/*`  | `none`    | Vor-Auth, kein Header               |
| `/admin/*`            | `admin`   | Eigene Admin-Navigation bleibt     |
| Alles andere          | `default` | UserMenu                            |

## Validierung und Edge-Cases

- LocalStorage gesperrt (Inkognito/Privacy-Modus) → `colorMode` fällt auf
  `system` zurück, kein Crash
- Page rendert vor Hydration: SSR-Mismatch beim Theme vermeiden — wird vom
  bestehenden `colorMode`-Script-Inline-Snippet (sichtbar im aktuellen
  HTML-Head) bereits abgefangen
- User-Menu auf Mobile: Dropdown vollbreit / als Drawer? In v1 reicht der
  Standard-Popover von Nuxt UI

## Tests

- **Manuell**: Theme-Switch auf jeder Page, Persistenz nach Reload prüfen
- **Manuell mobile**: Avatar tippbar, Dropdown lesbar
- **Keine Service-Tests**: rein UI

## Offene Fragen

- Avatar-Quelle: aktuell kein Foto im Profil — bis das Foto-Feature kommt,
  zeigen wir die Initialen (z. B. „AA" für Anna Admin) auf gefärbtem Kreis
- Soll die Login-Page auch einen Theme-Toggle haben? Vorschlag: nein,
  Login ist kurz und Default-System-Mode reicht

## Out of Scope für diesen Schritt

- Foto-Upload (FR-1) — eigenes Feature `profile-photo`
- Customizable Brand-Farben pro Verein
- Server-Persistenz der Theme-Wahl (Cross-Device-Sync)
