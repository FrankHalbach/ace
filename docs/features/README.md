# Feature-Design-Docs

Hier liegt für jedes umzusetzende Feature ein eigenes Unterverzeichnis
mit einem Design-Doc. Das Design-Doc wird **vor der Implementierung**
geschrieben.

## Struktur eines Features

```
docs/features/<feature-name>/
├── design.md       # Was, wie, welche FR-IDs
├── notes.md        # Optional: offene Punkte, Diskussions-Verlauf
└── api.md          # Optional: detaillierte Endpoint-Beschreibung
```

## Empfohlene Reihenfolge (Vorschlag, kann sich ändern)

1. `members` — Mitglieder-CRUD, Profile, Sichtbarkeits-Stufen
2. `auth` — Magic-Link, Sessions, Eltern-Kind-Zuordnung
3. `seasons` — Saison-Lifecycle, Altersgruppen
4. `rankings` — Rangliste pro Saison/Altersgruppe/Variante
5. `challenges` — Challenge-Lifecycle, Regelwerk
6. `results` — Ergebniserfassung, Match-Modi, Streit-Lösung
7. `friendlies` — Freundschaftsspiele, offene Suchen
8. `suggestions` — Match-Vorschläge, Cron-Job
9. `notifications` — Email-Versand, Digest
10. `trainer-view` — Trainer-Dashboard, Aktivitäts-Report
11. `admin` — Admin-Konsole, CSV-Import, Konfiguration
12. `pwa` — Mobile-Optimierung, Web-App-Manifest

## Template

Siehe [`_template.md`](_template.md). Kopieren, ausfüllen, Status setzen.
