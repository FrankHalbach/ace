# 003 – Authentifizierung: Magic-Link via Email

**Status**: akzeptiert
**Datum**: 2026-05-11
**Entscheider**: Frank

## Kontext

Authentifizierungs­strategie für die Plattform.
Constraints:

- Vereinsmitglieder unterschiedlicher Alters- und Technik-Affinität (14–80+ Jahre)
- Niemand soll wegen fehlender Google/Apple-Accounts ausgeschlossen werden
- DSGVO: möglichst wenig Daten von Drittanbietern (kein US-OAuth)
- Niedrige Hürde wichtiger als hohe Sicherheit (interne Vereinsdaten, kein Banking)
- Eltern verwalten Kinder-Profile (siehe Spec FR-40)

## Entscheidung

**Email-Magic-Link** als primärer Login-Mechanismus.
Für jeden Login-Versuch wird ein Einmal-Token an die Email-Adresse gesendet,
der Klick auf den Link erzeugt eine Session.

Optional in v2: Email + Passwort für Nutzer, die Magic-Links unbequem finden,
besonders für Admin/Trainer-Rollen mit häufiger Nutzung.

## Konsequenzen

### Positiv
- Keine Passwörter zu vergessen, keine Passwort-Reset-Flows nötig
- Funktioniert mit jeder Email-Adresse
- DSGVO-freundlich: keine externen Identity-Provider
- Klein zu implementieren mit `nuxt-auth-utils`
- Session-basiert mit HTTP-Only-Cookies, sicher gegen XSS-Token-Diebstahl

### Negativ
- Abhängig von Email-Zustellbarkeit (SPF/DKIM/DMARC müssen sauber sein)
- Bei Email-Provider-Ausfällen kein Login möglich
- Etwas langsamer als Passwort-Login (Wechsel zur Mail-App)
- Auf shared devices (z. B. Familien-Tablet) potentiell unsicher

### Neutral
- Magic-Link-Tokens müssen kurzlebig sein (Vorschlag: 15 Minuten)
- Anti-Misuse: max. 3 Magic-Link-Anfragen pro Stunde pro Email (siehe Spec FR-114)

## Alternativen

### Alternative A: Email + Passwort
- Vertrauter, aber mehr Code (Hashing mit Argon2id, Reset-Flow, Validierung)
- Höhere Hürde für Erst-Anmeldung (Passwort ausdenken und merken)

### Alternative B: OAuth (Google, Apple, Facebook)
- Bequem, aber schließt Mitglieder ohne diese Konten aus
- DSGVO-Aufwand mit US-Anbietern
- Externe Abhängigkeit

### Alternative C: Eigene Lösung mit JWT
- Mehr Kontrolle, aber auch mehr Verantwortung (Token-Rotation, Speicherung)
- Bei einer Vereinsanwendung dieser Größe unnötig

## Referenzen

- Spec NFR-2, FR-114
- nuxt-auth-utils: https://github.com/atinux/nuxt-auth-utils
