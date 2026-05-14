# 004 – Hosting und Deployment (Phasen-Strategie)

**Status**: vorgeschlagen
**Datum**: 2026-05-14
**Entscheider**: Frank

## Kontext

Wo läuft die Anwendung — und wann?

Constraints:
- DSGVO: EU-Hosting bei produktivem Betrieb mit echten Mitgliederdaten Pflicht
- Möglichst geringe laufende Kosten
- Backup-Strategie muss einfach sein
- Volle Kontrolle über Cron-Jobs und Long-Running-Tasks
- Solo-Entwicklung — Operations-Aufwand soll überschaubar bleiben
- Vor produktivem Rollout braucht es eine Demo-Phase für Trainer und Vorstand

Eine einmalige „endgültige" Hosting-Entscheidung wäre verfrüht. Erst nach der
Demo-Phase ist klar, ob der Verein die Plattform überhaupt produktiv ausrollen
will. Daher: gestaffeltes Vorgehen.

## Entscheidung

Drei Phasen mit jeweils eigener Infrastruktur. Jede Phase hat ein klares
Übergangs-Kriterium zur nächsten.

### Phase 1 — Lokale Entwicklung

- **Wo**: Entwickler-Rechner, `pnpm dev`
- **DB**: lokale SQLite-Datei
- **Daten**: ausschließlich Seed-Daten und Test-Mitglieder
- **Dauer**: bis die App vorzeigbar ist

Übergang zu Phase 2, sobald ein zusammenhängender Feature-Pfad demonstrierbar
ist (z. B. Login → Rangliste → Challenge erstellen → Ergebnis melden).

### Phase 2 — Demo-Hosting (Fly.io, Region Frankfurt)

- **Wo**: [Fly.io](https://fly.io), Region `fra` (Frankfurt)
- **DB**: SQLite auf Fly Persistent Volume
- **Daten**: **nur Testdaten**, keine echten Mitgliederdaten — Fly.io ist eine
  US-Firma, daher kommt Phase 2 ohne personenbezogene Daten realer Mitglieder aus
- **Deployment**: `flyctl deploy` lokal oder via GitHub Actions
- **Cron-Jobs**: Fly Machines mit `schedule`-Konfiguration
- **TLS**: automatisch durch Fly.io
- **Kosten**: kleine App im Free Tier, sonst wenige Euro pro Monat
- **Operations-Aufwand**: praktisch null

Übergang zu Phase 3, sobald die Plattform produktiv mit echten Mitgliederdaten
genutzt werden soll.

### Phase 3 — Produktion (Entscheidung dann)

Wenn die Demo überzeugt und produktiv ausgerollt werden soll, wird die
Hosting-Frage erneut bewertet. Der aktuelle Stand der Erwägungen:

**Leading Candidate: Hetzner Cloud VPS**
- CX22 oder CPX11 (~4–6€/Monat)
- Docker Compose für die Anwendung (Nuxt-Build als Container)
- Caddy als Reverse-Proxy mit automatischem Let's-Encrypt-TLS
- Backup: tägliches `sqlite3 .backup` + rsync zur Hetzner Storage Box
- CI/CD: GitHub Actions baut Docker-Image, deployt via SSH
- Email-Versand: Brevo (300 Mails/Tag kostenlos, EU-gehostet)

**Operations-Aufwand realistisch (für diesen Stack)**:
- Initial-Setup: einmalig 4–6 Stunden
- Laufend: ~30 min/Monat (Logs, `apt upgrade` quartalsweise, Backup-Check)
- Unattended-upgrades + Caddy-Auto-TLS reduzieren Eingriffe deutlich

**Alternativen, die in Phase 3 nochmal geprüft werden**:
- Fly.io produktiv weiterführen, wenn die DSGVO-Situation mit US-Anbietern in
  EU-Region zum Zeitpunkt der Entscheidung als vertretbar gilt (AVV, SCC)
- Managed Container-Plattform mit explizitem EU-Sitz, falls bis dahin eine
  überzeugende Option existiert

Die finale Entscheidung in Phase 3 wird als **neuer ADR** dokumentiert, der
diesen hier ersetzt.

## Konsequenzen

### Positiv
- Schneller Start ohne Server-Admin-Aufwand
- Demo möglich, ohne sich auf eine produktive Infrastruktur festzulegen
- DSGVO-Risiko in der Demo-Phase null, weil keine echten Mitgliederdaten
- Migration zwischen den Phasen ist gering: gleicher Docker-Build, SQLite-File
  rüberkopieren

### Negativ
- Zwei Hosting-Stacks zu kennen (Fly.io + ggf. Hetzner) — leichte
  kognitive Doppelbelastung
- Phase-3-Entscheidung wird verschoben, nicht jetzt getroffen — könnte später
  unter Zeitdruck stehen, wenn der Rollout drängt

### Neutral
- Phase-Übergänge sind klar definierte Punkte, an denen Verantwortlichkeit und
  Operations-Modell neu durchdacht werden müssen

## Offene Punkte (für Phase-3-Entscheidung)

- Langfristige Verantwortlichkeit für Server-Pflege und Sicherheits-Updates
- Domain-Registrierung im Verein oder privat
- Vereins-SMTP verfügbar oder Brevo als externer Dienst
- Backup-Aufbewahrung und Restore-Test-Routine

## Referenzen

- ADR-001 (Tech-Stack), ADR-002 (Datenbank)
- NFR-7, NFR-10, NFR-11 — gelten in vollem Umfang ab Phase 3
- Fly.io Regionen und Volumes: https://fly.io/docs/reference/regions/
- Hetzner Cloud: https://www.hetzner.com/cloud
