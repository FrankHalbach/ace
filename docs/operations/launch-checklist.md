# Launch-Checklist

**Status**: pre-launch v1
**Letzte Änderung**: 2026-05-21

Manueller Inbetriebnahme-Pfad für die v1-Beta. Schritt-für-Schritt vom leeren
Production-Host bis zum ersten Mitglieder-Login. Verbindlich für die Person, die
den Launch durchführt — abgehakte Schritte sind erledigt, nichts überspringen
ohne Notiz auf der Issue/PR-Seite.

## 1. Infrastruktur

- [ ] **Hosting-Ziel entschieden** (Fly.io, eigener VServer, anderes — siehe
  [ADR-004](../decisions/) zur Phasen-Strategie). Diese Checkliste setzt nicht
  voraus, *welches* Hosting; sie zählt nur auf, was vor Ort konfiguriert sein
  muss.
- [ ] **HTTPS** mit gültigem Zertifikat. Magic-Link-Cookies sind `Secure`-only —
  ohne HTTPS funktioniert das Login nicht.
- [ ] **Domain** zeigt aufs Hosting (`ace.tus-neureut.de` o. ä.).
- [ ] **Backups**: `data/ace.db` wird regelmäßig (mind. täglich) gesichert.
  Konkretes Backup-Verfahren in `docs/operations/backups.md` festhalten —
  separater Schritt vor Launch.
- [ ] **Persistenz** der DB-Datei: das Volume, auf dem `data/ace.db` liegt,
  überlebt Container-/Process-Restarts.

## 2. Environment-Variablen

`.env` auf dem Produktionssystem anlegen, alle Werte unten ausfüllen.

| Variable | Wert für Production |
|---|---|
| `NUXT_SESSION_PASSWORD` | **frisch** generieren: `openssl rand -base64 32`. Nicht aus Dev übernehmen. Wechsel = alle Sessions ungültig |
| `NUXT_SMTP_HOST` | `smtp-relay.brevo.com` |
| `NUXT_SMTP_PORT` | `587` |
| `NUXT_SMTP_USER` | Brevo-Login-Email (das Account-Email selbst, nicht der SMTP-Key) |
| `NUXT_SMTP_PASS` | SMTP-Key aus dem Brevo-Dashboard → SMTP & API → SMTP. Nicht das Account-Passwort |
| `NUXT_SMTP_SECURE` | `false` (STARTTLS auf 587) |
| `NUXT_MAIL_FROM` | `"ace · TuS Neureut <no-reply@tus-neureut.de>"` — die Absender-Domain muss in Brevo verifiziert sein (DKIM/SPF), sonst landen Mails im Spam |
| `NUXT_DB_PATH` | `./data/ace.db` (oder absoluter Pfad zur Volume-Location) |
| `NUXT_PUBLIC_BASE_URL` | `https://ace.tus-neureut.de` — **mit https://**, ohne Trailing-Slash |
| `NUXT_AUTH_MAGIC_LINK_LIMIT_PER_HOUR` | `3` (Spec-Default FR-114, nicht das lokale 100 übernehmen) |

- [ ] Alle Variablen gesetzt
- [ ] `.env` ist nicht weltlesbar (`chmod 600` auf POSIX-Hosts)

## 3. Brevo-Account

- [ ] **Brevo-Account** existiert (kostenloser Tier reicht: 300 Mails/Tag, EU)
- [ ] **Absender-Domain** `tus-neureut.de` verifiziert (DKIM-/SPF-/Return-Path-Records
  beim Domain-Provider eingetragen). Ohne Verifizierung landen Mails im Spam.
- [ ] **SMTP-Key** in Brevo erzeugt und in `NUXT_SMTP_PASS` eingetragen
- [ ] **Test-Mail** gesendet: lokal mit `pnpm dev` und produktiven Brevo-Creds
  einmal Login probieren, prüfen dass die Mail wirklich ankommt (Postfach +
  Brevo-Dashboard → Statistiken)
- [ ] **AVV mit Brevo SAS** abgeschlossen — siehe [DSGVO](dsgvo.md) §8. Brevo
  bietet im Dashboard einen DPA zum Download (Settings → Compliance → DPA).

## 4. Datenbank-Reset und Initial-Daten

Die Dev-DB enthält Beispieldaten und Test-Mitglieder, die nicht in Production
sollen. Vor Launch frisch aufsetzen:

```bash
# Auf dem Production-Host, im App-Verzeichnis:
pnpm db:migrate     # legt data/ace.db an + alle Migrationen
# KEIN pnpm db:seed in Production — die Seed-Daten sind nur für Dev
```

- [ ] `data/ace.db` ist frisch erzeugt, keine Seed-Daten
- [ ] **Initial-Admin** angelegt — direkt per SQL einfügen, weil noch kein
  Admin-UI verfügbar ist:

  ```sql
  INSERT INTO member (id, email, first_name, last_name, birth_year, gender, dtb_lk, status, roles)
  VALUES (lower(hex(randomblob(12))),
          'admin@tus-neureut.de', 'Admin', 'Vorstand',
          1980, 'm', 25.0, 'aktiv',
          json_array('player', 'admin'));
  ```

  E-Mail anpassen — das ist die Adresse, an die der Magic-Link für den ersten
  Login geht.
- [ ] Erste Saison + Altersgruppen anlegen (über `/admin/seasons`, nachdem der
  Initial-Admin sich einloggen konnte). Oder als SQL-Skript dokumentieren, falls
  bekannt.
- [ ] Mitglieder-CSV importieren (über `/admin/members/import`). CSV-Format
  siehe [Admin-Design-Doc](../features/admin/design.md#csv-import-schema).
- [ ] Bulk-Invite an alle importierten Mitglieder (über
  `/admin/members` → Auswahl → „Einladen").

## 5. Smoke-Tests am Produktions-System

Vor dem Mitglieder-Versand testen — am besten mit zwei realen Email-Adressen
des Verantwortlichen.

- [ ] **Login-Flow**: `/login` öffnen, Admin-Email eingeben, Magic-Link in der
  Mail anklicken, Session steht
- [ ] **Profil-Edit**: `/profile` öffnen, Notification-Prefs ändern, Speichern,
  reload → Werte bleiben
- [ ] **CSV-Import** mit Test-Mitglied
- [ ] **Invite-Versand** an das Test-Mitglied, Mail kommt an
- [ ] **Test-Login** als das eingeladene Mitglied
- [ ] **Challenge anlegen** zwischen Admin und Test-Mitglied
- [ ] **Friendly anlegen** mit `scheduledAt` morgen
- [ ] **Notification-Mails** bekommen beide Parteien (Brevo-Statistiken
  bestätigen den Versand)
- [ ] **Rate-Limit greift**: 4. Magic-Link-Anforderung innerhalb einer Stunde
  wird abgelehnt (`429`)

## 6. Letzter Sanity-Pass

- [ ] **Audit-Log** unter `/admin/audit` zeigt alle Aktionen aus Smoke-Tests
- [ ] **Trainer-Sicht** funktioniert (Rolle einem zweiten Account zuweisen,
  einloggen, `/trainer` öffnen)
- [ ] **Mobil-Viewport** stichprobenartig — Home, Ranglisten-Detail, Challenges,
  Profil. Touch-Targets ≥ 44 px, keine Layout-Brüche
- [ ] **Dark Mode** schaltbar und visuell sauber
- [ ] **Notification-Prefs** funktionieren: Opt-Out testweise setzen, Match
  auslösen, prüfen dass keine Mail ankommt
- [ ] **README + DSGVO-Doku** in der finalen Fassung gemerged

## 7. Mitgliederrollout

- [ ] Stichtag im Vorstand abgestimmt
- [ ] **Begleit-Mail** an alle Mitglieder vorbereitet (außerhalb von `ace`,
  z. B. über den Vereins-Verteiler) mit:
  - Was `ace` ist
  - Wie der Magic-Link-Login funktioniert
  - Hinweis auf Spam-Ordner-Check
  - Wer der Sportwart als Anlaufstelle ist
  - DSGVO-Hinweis: welche Daten verarbeitet werden, Widerspruchs-/Auskunftsrecht
- [ ] **Invite-Mails** in `ace` versendet (Bulk-Invite über Admin-UI), nachdem
  die Begleit-Mail draußen ist
- [ ] **Erste 48 Stunden** aktiv beobachten — Brevo-Statistiken auf Bounces,
  Audit-Log auf Fehlersignale, Logs auf Stack-Traces

## 8. Nach Launch (Tag 1-7)

- [ ] **Backup-Job** verifiziert, dass produktive `ace.db` täglich gesichert
  wird
- [ ] **Brevo-Quota** überwachen (300 Mails/Tag im Free-Tier) — bei knapp
  werdender Quota auf bezahlten Tier upgraden oder Notification-Versand
  reduzieren
- [ ] **Open Issues triagieren**, die aus dem Launch entstehen — neue Bugs
  als `bug` labeln, Feature-Wünsche auf v1.1/v2
- [ ] **N-04 review** ([Issue #74](https://github.com/FrankHalbach/ace/issues/74))
  und **N-01 Diversitäts-Bonus** ([Issue #33](https://github.com/FrankHalbach/ace/issues/33))
  mit ersten Real-Daten erneut bewerten

## Bewusst nicht in dieser Checklist

- **Monitoring-/Alerting-Setup**: für ~500 Mitglieder genügt Brevo-Statistiken
  + manueller Audit-Log-Sweep. APM o. ä. = v2.
- **CDN / Performance-Tuning**: SQLite + Nitro reichen für die erwartete Last.
- **Mehrsprachigkeit**: Deutsch only, siehe Spec.
- **Mobile-App-Variante**: PWA reicht für v1.
