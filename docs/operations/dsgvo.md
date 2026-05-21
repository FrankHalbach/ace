# DSGVO-Operations

**Status**: pre-launch v1
**Letzte Änderung**: 2026-05-21

Dieses Dokument beschreibt, wie DSGVO-relevante Vorgänge in `ace` operativ
umgesetzt werden, solange die App in der v1-Beta läuft (kein Admin-UI für
Lösch-Workflows, alles per manuellem SQL-Eingriff durch den Verantwortlichen).

Verbindlich für die Person, die Anfragen nach Art. 15/16/17 DSGVO bearbeitet —
in v1 ist das der Vereinsvorstand bzw. der/die delegierte Admin.

## 1. Geltungsbereich und Verantwortlicher

- **Verantwortlicher**: TuS Neureut e. V., Tennis-Abteilung
- **Verarbeitungsgrundlage**:
  - Vereinsmitgliedschaft (Art. 6 Abs. 1 lit. b DSGVO) für Stammdaten, Match-Daten, Rangliste
  - Berechtigtes Interesse (lit. f) für Audit-Log
  - Einwilligung (lit. a) für Email-Benachrichtigungen ist **nicht** separat eingeholt — Spieler steuert pro Ereignis via Notification-Prefs (Default: an), Opt-Out jederzeit möglich. Saubere Lösung wäre ein expliziter Consent-Schritt beim Onboarding; vor Launch dokumentieren als bekannte Lücke
- **Drittland-Übermittlung**: keine zur Laufzeit. Brevo-SMTP-Relay verarbeitet die Empfänger-Email und den Mail-Body innerhalb der EU (Frankfurt); AVV mit Brevo SAS abzuschließen vor Launch. Fonts (Source Sans 3, JetBrains Mono) werden über `@nuxt/fonts` einmalig beim Build lokal vendoriert und aus `public/_fonts/` ausgeliefert — **kein** Runtime-Connect zu fonts.googleapis.com, daher keine IP-Übermittlung an Google in den USA

## 2. Daten-Inventar

| Kategorie | Tabelle / Feld | Quelle | Bemerkung |
|---|---|---|---|
| Identität | `member.firstName`, `lastName`, `birthYear`, `gender` | CSV-Import, Self-Service-Profil | Pflicht |
| Kontakt | `member.email` | CSV-Import | Pflicht für Magic-Link-Login |
| Spielstärke | `member.dtbLk` | CSV-Import / Trainer-Korrektur | aus öffentlichem DTB-Ranking, aber an Person verknüpft |
| Match-Historie | `challenge`, `match_result`, `match_points_award`, `friendly`, `friendly_invitee`, `friendly_result` | App-Nutzung | personenbezogen via `memberId`-FK |
| Rangliste | `ranking_entry` | abgeleitet | Snapshot pro Saison, enthält Position + Punkte |
| Mannschafts-Tags | `member_team_tag` | Admin/Trainer | Anzeige-Layer |
| Auth-Tokens | `magic_link_token` | Login/Invite-Flow | Short-lived, kein PII außer `memberId`-FK |
| Audit-Trail | `audit_entry` | Admin/Trainer-Aktionen | `actor_id` + JSON-Diff der Aktion |
| Operative Counter | `rate_limit_event` | Server | enthält `key` (kann Email/IP-Hash enthalten) |
| Login-Status | `member.firstLoginAt`, `member.invitedAt`, `member.invitedBy` | Auth-Flow | |
| Deaktivierung | `member.deactivatedAt`, `member.deactivationReason` | Admin-Aktion | Freitext — kein PII Dritter eintragen |

**Keine** Speicherung von: Klartext-Passwörter, IP-Adressen über die Request-
Lebensdauer hinaus, Browser-Fingerprints, Tracking-Pixel, Telefonnummern (bis FR-6b
implementiert ist — siehe Memory zu Phone-Hardening).

## 3. Auskunft (Art. 15 DSGVO)

Anfrage formlos an den Vereinsvorstand. Bearbeitung binnen 30 Tagen. Folgende
Queries liefern alle personenbezogenen Daten eines Mitglieds — Resultate als CSV
oder PDF exportieren und dem Mitglied übergeben.

Voraussetzung: SQLite-Datenbank-Datei (`data/ace.db`) per `pnpm db:studio` oder
`sqlite3` öffnen.

```sql
-- Stammdaten (1 Zeile)
SELECT * FROM member WHERE id = :memberId;

-- Audit-Einträge, in denen das Mitglied Subjekt war
SELECT * FROM audit_entry WHERE subject_kind = 'member' AND subject_id = :memberId
  ORDER BY created_at;

-- Audit-Einträge, die das Mitglied selbst ausgelöst hat
SELECT * FROM audit_entry WHERE actor_id = :memberId ORDER BY created_at;

-- Rangliste-Einträge
SELECT * FROM ranking_entry WHERE member_id = :memberId;

-- Challenges als Forderer oder Geforderter
SELECT * FROM challenge WHERE challenger_id = :memberId OR challenged_id = :memberId;

-- Match-Ergebnisse (Challenges)
SELECT mr.* FROM match_result mr
  JOIN challenge c ON c.id = mr.challenge_id
  WHERE c.challenger_id = :memberId OR c.challenged_id = :memberId;

-- Punkte-Awards
SELECT * FROM match_points_award WHERE member_id = :memberId;

-- Friendlies (als Initiator)
SELECT * FROM friendly WHERE initiator_id = :memberId;

-- Friendlies als Eingeladener
SELECT f.* FROM friendly f
  JOIN friendly_invitee fi ON fi.friendly_id = f.id
  WHERE fi.member_id = :memberId;

-- Mannschafts-Tags
SELECT tt.name, mtt.assigned_at FROM member_team_tag mtt
  JOIN team_tag tt ON tt.id = mtt.team_tag_id
  WHERE mtt.member_id = :memberId;

-- Aktuelle Magic-Link-Tokens (sollten i.d.R. leer/abgelaufen sein)
SELECT token, created_at, expires_at, consumed_at FROM magic_link_token
  WHERE member_id = :memberId ORDER BY created_at DESC LIMIT 20;
```

## 4. Berichtigung (Art. 16 DSGVO)

Stammdaten kann das Mitglied **selbst** unter `/profile` korrigieren
(Vorname, Nachname, Geburtsjahr, Geschlecht, LK, Status, Spielarten,
Notifications). Email-Adresse bleibt admin-only und wird auf Anfrage manuell
geändert:

```sql
UPDATE member SET email = :newEmail, updated_at = unixepoch() WHERE id = :memberId;
```

Audit-Eintrag manuell ergänzen (Action existiert noch nicht im Enum — entweder
neuen Code-Pfad bauen oder pragmatisch als `member.role-changed`-Variante mit
Note):

```sql
INSERT INTO audit_entry (id, actor_id, action, subject_kind, subject_id, before, after, note)
VALUES (lower(hex(randomblob(12))), :adminId, 'member.role-changed',
        'member', :memberId,
        json_object('email', :oldEmail), json_object('email', :newEmail),
        'Email-Berichtigung gem. Art. 16 DSGVO');
```

> **TODO vor Launch**: eigene `AuditAction` `member.profile-corrected` ins Enum
> aufnehmen und einen schmalen Admin-Endpoint `PATCH /api/admin/members/:id/email`
> ergänzen, falls Berichtigungs-Anfragen häufig werden. Manueller Pfad reicht
> für die ersten Wochen.

## 5. Löschung (Art. 17 DSGVO)

### 5.1 Soft-Delete (Austritt)

Standardpfad bei Vereinsaustritt: über das Admin-UI unter `/admin/members` die
Deaktivierung auslösen. Setzt `status='pausiert'`, `deactivatedAt=now()` und
schreibt einen Audit-Eintrag `member.deactivated`. Das Mitglied verschwindet
aus Vorschlägen, bleibt aber in Match-Historie sichtbar — das ist die für eine
Vereinsplattform übliche Lösung (Historie der Spiele anderer Mitglieder bleibt
erhalten).

### 5.2 Hard-Delete (auf explizite Anfrage des Mitglieds)

Sobald ein ehemaliges Mitglied eine **explizite Löschungs-Anfrage** stellt, wird
hart gelöscht. Ablauf:

1. **Prüfen**, ob die Aufbewahrungsfrist (siehe §6) abgelaufen ist. Wenn nicht,
   Anfrage formell beantworten und Hard-Delete zum Fristende terminieren.
2. **Backup** der `data/ace.db` ziehen, bevor irgendetwas gelöscht wird.
3. **Pseudonymisierung statt Löschen** für Daten, die andere Mitglieder
   betreffen (Match-Ergebnisse, Ranglisten-Einträge). Wir können den Match-Datensatz
   nicht ersatzlos löschen, ohne die Sieg-Bilanz des Gegners zu verfälschen — also
   ersetzen wir den Personenbezug.

```sql
BEGIN;

-- Schritt A: Personenbezug aus member entfernen, Datensatz selbst behalten
UPDATE member SET
  email = printf('deleted-%s@local.invalid', id),
  first_name = 'gelöscht',
  last_name = '',
  birth_year = 0,
  deactivation_reason = 'Löschung Art. 17 DSGVO am ' || date('now'),
  updated_at = unixepoch()
WHERE id = :memberId;

-- Schritt B: Audit-Diffs scrubben (before/after kann PII enthalten)
UPDATE audit_entry SET before = NULL, after = NULL, note = '[scrubbed Art. 17]'
WHERE actor_id = :memberId OR (subject_kind = 'member' AND subject_id = :memberId);

-- Schritt C: Tokens hart weg
DELETE FROM magic_link_token WHERE member_id = :memberId;

-- Schritt D: Mannschafts-Zuordnungen weg
DELETE FROM member_team_tag WHERE member_id = :memberId;

COMMIT;
```

Match-Daten (`challenge`, `friendly`, `match_result`, `ranking_entry`,
`match_points_award`) **bleiben unverändert** und referenzieren die
pseudonymisierte `member`-Zeile. Diese Lösung ist DSGVO-konform, weil die
Identifizierbarkeit (Erw. 26 DSGVO) durch Schritt A entfällt — gleichzeitig
bleibt die Datenintegrität für Mit-Spieler erhalten.

### 5.3 Wann komplett `DELETE FROM member`?

Nur wenn keine Match-Daten an dem Mitglied hängen (z. B. eingeladen, nie
gespielt). Dann:

```sql
DELETE FROM member WHERE id = :memberId
  AND NOT EXISTS (SELECT 1 FROM challenge WHERE challenger_id = :memberId OR challenged_id = :memberId)
  AND NOT EXISTS (SELECT 1 FROM friendly WHERE initiator_id = :memberId)
  AND NOT EXISTS (SELECT 1 FROM friendly_invitee WHERE member_id = :memberId)
  AND NOT EXISTS (SELECT 1 FROM ranking_entry WHERE member_id = :memberId);
```

## 6. Aufbewahrungsfristen

| Datenkategorie | Frist | Rechtfertigung |
|---|---|---|
| Stammdaten aktives Mitglied | unbegrenzt | Vereinsmitgliedschaft |
| Stammdaten deaktiviertes Mitglied | 12 Monate ab `deactivatedAt` | Anschluss an folgende Saison ermöglichen |
| Match-Historie | unbegrenzt pseudonymisiert | Spiel-Statistik anderer Mitglieder |
| Audit-Log | 36 Monate | Compliance/Streitfall-Aufklärung |
| Magic-Link-Token | 30 Tage nach `expiresAt` | technischer Cleanup, kein PII-Wert nach Ablauf |
| Rate-Limit-Events | 7 Tage | nur kurzfristig sinnvoll |
| Brevo-Mail-Logs (extern) | gemäß Brevo-AVV | außerhalb unserer Kontrolle |

Nightly-Cleanup-Job ist v1 **nicht** automatisiert. Quartalsweise per Hand:

```sql
-- Magic-Link-Token älter als 30 Tage nach Ablauf
DELETE FROM magic_link_token WHERE expires_at < unixepoch() - 30*24*3600;

-- Rate-Limit-Events älter als 7 Tage
DELETE FROM rate_limit_event WHERE occurred_at < unixepoch() - 7*24*3600;
```

## 7. Datensicherheit

- **DB-Datei** `data/ace.db` liegt auf dem Server-Host, nicht im Repo. Backups
  verschlüsselt ablegen (Server-seitig per `borg` o. ä. — vor Launch
  entscheiden, separates Doku-File `docs/operations/backups.md` folgt).
- **Magic-Link-Tokens**: 32 Byte Entropie aus `crypto.randomBytes`, im Klartext
  per Email verschickt, nach Konsum gesperrt. Keine zusätzliche Hash-Schicht in
  der DB — der Token *ist* das Geheimnis, vergleichbar mit Session-Cookies.
- **Session-Cookies**: HTTP-Only, Secure, SameSite=Lax. Drei-Stunden-TTL via
  `nuxt-auth-utils`.
- **HTTPS**: zwingend in Produktion (Reverse-Proxy / Hosting-Setup, kein Doku-Fall hier).
- **Foreign Keys**: `PRAGMA foreign_keys=ON` ist gesetzt; CASCADE-Deletes nur
  dort, wo gewünscht (Magic-Link-Token, Team-Tag-Zuordnungen). Sonst RESTRICT.

## 8. Auftragsverarbeiter

| Anbieter | Zweck | Vertrag | Region |
|---|---|---|---|
| **Brevo SAS** | Transactional Email (Magic-Link, Notifications) | AVV abzuschließen vor Launch | EU (Frankfurt-Rechenzentrum) |

Kein weiterer AVV-pflichtiger Dienst. Hosting-Anbieter (Plattform für `pnpm
start`) ist separat im Hosting-Doku zu führen.

## 9. Bekannte Lücken (vor Launch zu schließen oder bewusst zu akzeptieren)

- **Consent-Schritt für Email-Notifications** bisher nicht explizit eingeholt
  (siehe §1). Pragmatisch: Notification-Prefs sind opt-out, im Onboarding-Text
  des Invite-Mails kurz darauf hinweisen. Volle Consent-UI = v2.
- **Automatisierter Token-/Rate-Limit-Cleanup** noch nicht als Cron-Job.
- **Audit-Log-Retention** noch nicht automatisiert (siehe §6).
- **Backup-Verschlüsselung** in separatem Doku zu beschreiben.
- **`AuditAction` für Email- und Profil-Berichtigungen** fehlt noch (siehe §4).

Jede dieser Lücken ist über manuellen Pfad operabel und damit für die v1-Beta
mit ~500 Mitgliedern und ~unter-100 aktiven akzeptabel. Bei Skalierung über v1
hinaus automatisieren.
