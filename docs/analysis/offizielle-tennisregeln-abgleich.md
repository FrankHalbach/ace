# Abgleich: ace-Regelwerk ↔ offizielle Tennis-Regelwerke

**Status:** Analyse · **Erstellt:** 2026-05-16 · **Letzter Code-Stand:** Branch `feat/ui-app-shell-bottom-nav`

## Kontext

Das ace-System bildet ein vereinsinternes Ranglisten-, Challenge- und Friendly-Modell ab.
An mehreren Stellen weicht es bewusst oder unbewusst von den offiziellen Tennis-Regelwerken ab.
Dieses Dokument vergleicht jede für den Vereinsbetrieb relevante Regel mit den drei
maßgeblichen Quellen:

- **ITF** — *ITF Rules of Tennis* (Spielmechanik: Spiel/Satz/Tie-Break/Match-Tie-Break/Code Violations)
- **WSPO** — *DTB Wettspielordnung* (Wettkampfverwaltung: w.o., Aufgabe, Disqualifikation, Strafen)
- **RanglistenO/LK** — *DTB Ranglistenordnung* + *DTB Leistungsklassen-Ordnung*

**Schweregrad-Skala**

| Skala | Bedeutung |
| --- | --- |
| **kritisch** | Datenintegrität / fachlich falsch — vor Launch schließen |
| **wichtig** | UX/Akzeptanz vor Launch — sollte vor Mitglieder-Launch adressiert werden |
| **kosmetisch** | Nice-to-have, post-Launch |
| **bewusst** | Dokumentierte Vereinfachung — kein Issue, nur Eintrag im Doc |

---

## A. Match-Scoring (ITF / WSPO)

| ID | Thema | ace-Regel (Code-Ref) | Offizielle Regel | Abweichung | Schweregrad | Empfehlung |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Set-Plausibilität (regulärer Satz) | [sets-validator.ts:19-36](../../server/modules/results/service/sets-validator.ts#L19-L36) prüft nur Satz-Anzahl; pro Satz nur „kein Unentschieden" und [results/types.ts:9-11](../../server/modules/results/types.ts#L9-L11) erlaubt Werte 0–20 | ITF *Rule 5*: Satz endet mit 6 Spielen bei mindestens 2 Vorsprung; sonst 7:5 oder 7:6 (Tie-Break) | Score wie `9:7`, `8:3`, `20:0` werden akzeptiert | **kritisch** | Set-Plausi pro `MatchMode` einführen: regulärer Satz ∈ {6:0..6:4, 7:5, 7:6}; Champions-TB im 3. Satz nur als `10:x` (x≤8) oder mit 2 Vorsprung; Kurzsatz analog (4:x, 5:3, 5:4-TB) |
| A2 | Match-Tie-Break (10 Punkte) Plausibilität | Wird im selben `sets`-Array als regulärer Satz gespeichert ([match-result.ts:34](../../server/db/schema/match-result.ts#L34)), kein Format-Check | ITF *Rule 5(d)*: 10 Punkte, 2 Punkte Vorsprung | `7:5`, `6:0` als „Champions-Tie-Break" möglich | **kritisch** | Im Modus `two-sets-match-tiebreak` / `best-of-3-champions` den 3. (bzw. Decider-)Satz strikt als `min(loser+2,10):loser` validieren |
| A3 | Pro-Set-Format | Nur 1 Satz, sonst kein Detail-Check ([sets-validator.ts:20-22](../../server/modules/results/service/sets-validator.ts#L20-L22)) | DTB-Praxis: 8-/9-Spiel-Pro-Set mit Tie-Break bei 8:8 / 9:9 | Länge nicht spezifiziert, jeder Score akzeptiert | **wichtig** | Pro-Set-Spielanzahl in `Season.config` parametrisieren (z. B. 8 oder 9) und validieren |
| A4 | No-Ad-Regel | Im `MatchMode`-Enum nicht abgebildet ([match-result.ts:9-15](../../server/db/schema/match-result.ts#L9-L15)) | ITF *Appendix V*: optional Sudden-Death-Punkt bei Deuce | Modus nicht wählbar | **kosmetisch** | Ggf. `no-ad`-Flag pro Saison ergänzen — nur falls vom Verein gewünscht |
| A5 | Walk-Over (`w.o.`) | Kein DB-Feld in [match-result.ts](../../server/db/schema/match-result.ts); auch in [friendly-result.ts](../../server/db/schema/friendly-result.ts) fehlt es. `pointValues.walkoverWin` ([points-table.ts:25](../../server/modules/rankings/strategy/points-table.ts#L25)) existiert nur als Punktwert ohne Modellierung des Falls | ITF/WSPO: Spieler erscheint nicht / zieht zurück **vor** Match-Beginn → Sieg ohne Score | Aktuell nur über „Trainer entscheidet via DISPUTED" abbildbar — kein sauberer Walk-Over-Pfad | **kritisch** | `MatchOutcome`-Feld einführen: `regular | walkover | retirement | default`; Schema- und API-Erweiterung. Memory-Eintrag `project_match_results_dtb` |
| A6 | Aufgabe (`ret.`) | Nicht modelliert — `validateSetsForMode` erzwingt 2–3 vollständige Sätze | ITF *Rule 30*: Spieler bricht ab → Sieg für Gegner mit Teilscore (z. B. `6:2, 3:1 ret.`) | Teilscores werden als „inkonsistenter Sieger" abgelehnt | **kritisch** | Bei `outcome=retirement` Set-Validierung lockern (letzter Satz darf unvollständig sein); Sieger explizit setzen |
| A7 | Disqualifikation (`def.`) | Nicht modelliert | ITF *Rule 32* / WSPO: Disqualifikation während Match → Sieg für Gegner | Workflow fehlt; Trainer-DISPUTED ist Behelf | **wichtig** | Im selben `MatchOutcome` als `default` mit Sieger/Grund-Notiz |
| A8 | Tie-Break-Plausibilität (regulärer 7-Punkte-TB) | `7:6` wird als ein Spielstand akzeptiert; der Tie-Break-Punktstand selbst wird nicht erfasst | ITF *Rule 5(c)*: 7 Punkte, 2 Punkte Vorsprung | TB-Detail nicht erfasst — irrelevant fürs Endergebnis, aber Statistik fehlt | **kosmetisch** | TB-Detail optional als separates Feld erfassen, falls Statistik gewünscht — sonst dokumentieren |

---

## B. Match-Verwaltung (WSPO)

| ID | Thema | ace-Regel (Code-Ref) | Offizielle Regel | Abweichung | Schweregrad | Empfehlung |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Ergebnis-Meldung durch wen | Sieger meldet, Verlierer bestätigt ([results/types.ts:64-69](../../server/modules/results/types.ts#L64-L69)); auto-confirm nach 3 Tagen (Spec FR-31..35) | WSPO: Beide Spieler unterschreiben Ergebnis vor Ort | Asynchron / Behelfslösung für Verein | **bewusst** (Spec FR-30..35) | Kein Issue. Im Doc verankert. |
| B2 | Streitfall-Auflösung | Trainer entscheidet ([challenges.ts:223-229](../../server/modules/challenges/service/challenges.ts#L223-L229)) | WSPO: Oberschiedsrichter / Verbandsgericht | Verein hat eigenen Mechanismus | **bewusst** (FR-32, kein DTB-Pendant nötig) | Kein Issue |
| B3 | Spielfristen | 7 d Annahme / 21 d Spiel ([challenges.ts:21-22](../../server/modules/challenges/service/challenges.ts#L21-L22)) | WSPO: Mannschafts-Spielfristen, nicht für Vereinsranglisten | Vereins-spezifisch | **bewusst** (FR-24, FR-25) | Kein Issue |
| B4 | Bedenkzeit, Aufwärm-Zeit, Seitenwechsel | Nicht abgebildet | ITF *Rules 29 (Continuous Play)*, *Rule 8 (Change of Ends)* | Out of Scope (Spec §7 listet es nicht namentlich; ergibt sich aus dem Plattform-Zweck — keine Live-Spielleitung) | **bewusst** (implizit Out-of-Scope, nicht namentlich in §7) | Kein Issue. Optional: §7 um Spielzeit-Regeln ergänzen, damit die Lücke spec-seitig dokumentiert ist. |
| B5 | Code of Conduct / Strafkatalog | Nicht abgebildet | ITF Code-Violation-System; DTB-Verhaltensregeln | Out of Scope, kein Schiedsrichter im System (in §7 nicht namentlich erwähnt) | **bewusst** (implizit Out-of-Scope) | Kein Issue. Gleiche Empfehlung wie B4. |

---

## C. Rangliste & LK (Ranglistenordnung)

| ID | Thema | ace-Regel (Code-Ref) | Offizielle Regel | Abweichung | Schweregrad | Empfehlung |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | LK-Sortierrichtung als Tiebreaker | `a.dtbLk - b.dtbLk` (aufsteigend) in [pyramid.ts:120-123](../../server/modules/rankings/strategy/pyramid.ts#L120-L123), [elo.ts:36-40](../../server/modules/rankings/strategy/elo.ts#L36-L40), [hybrid.ts:38-42](../../server/modules/rankings/strategy/hybrid.ts#L38-L42), [points-table.ts:56-61](../../server/modules/rankings/strategy/points-table.ts#L56-L61). Spec **FR-12** („Sortierung primär nach interner Wertung, DTB-LK als Zusatz") | DTB-LK: `1.0` = stärkster, `25.0` = schwächster | Sortierrichtung korrekt umgesetzt | **bewusst** (FR-12) | Kein Issue — explizit positiv dokumentieren |
| C2 | Tiebreaker in `points-table` bei gleichem Punktstand | Sortierung nach Punkten desc, dann **MemberId asc** ([points-table.ts:124-129](../../server/modules/rankings/strategy/points-table.ts#L124-L129)); JSDoc Z. 83 sagt selbst „vereinfacht: ID statt LK" | Spec-Nachtrag N-01: LK als Tiebreaker | Code-Kommentar nennt es Vereinfachung, aber widerspricht N-01 | **wichtig** | LK in `applyResult` mitreichen (ist im Repository als `memberLk` vorhanden, [ranking-entry-repo.ts:33](../../server/modules/rankings/repository/ranking-entry-repo.ts#L33)) und als Tiebreaker nutzen |
| C3 | Geschlechter-Enforcement | Spec **FR-10** („Pro Altersgruppe drei Ranglisten: Herren, Damen, Offen") + **FR-10a** („Automatisch in Geschlechts­rangliste eingetragen"). Code-Umsetzung: [generate.ts:96-98](../../server/modules/rankings/service/generate.ts#L96-L98) filtert beim Befüllen korrekt; [challenges.ts:101-110](../../server/modules/challenges/service/challenges.ts#L101-L110) prüft Ranglisten-Mitgliedschaft | DTB-Damen-/Herren-Rangliste strikt getrennt | Effektiv strikt — keine direkte Lücke gefunden | **bewusst** (FR-10, FR-10a) | Kein Issue. Optional Test, der das absichert. |
| C4 | Geschlecht nur `m` / `w` | [member.ts:33](../../server/db/schema/member.ts#L33) Enum `m | w` | DTB unterscheidet ebenfalls binär | Identisch zur DTB-Praxis | **bewusst** | Kein Issue. Wenn DSGVO/Diversität später relevant, eigenes Thema. |
| C5 | Mehrfach-Zugehörigkeit Altersgruppen | Spec **FR-2** („Mehrfachzuordnung ist möglich, z. B. U16-Spieler kann gleichzeitig U18 spielen"); [generate.ts:101-104](../../server/modules/rankings/service/generate.ts#L101-L104) ordnet nur per `minAge`/`maxAge` ein | DTB: Spieler hat eine Hauptaltersklasse mit definierten Aufrück-Regeln | Bewusst lockerer als DTB | **bewusst** (FR-2) | Kein Issue |
| C6 | Wertungs-Modi (Pyramide, ELO, Hybrid, Punkte-Tabelle) | [strategy/*.ts](../../server/modules/rankings/strategy/) | DTB kennt nur Punkte-Modell | Komplett anderes Modell als DTB-Bundesrangliste | **bewusst** (Spec § 4, ADR-006) | Kein Issue |
| C7 | Saison-Übergang (reset/takeover/softened) | [pyramid.ts:35-60](../../server/modules/rankings/strategy/pyramid.ts#L35-L60); ELO/Hybrid/Points-Table ignorieren Übergangs-Strategie ([elo.ts:30-41](../../server/modules/rankings/strategy/elo.ts#L30-L41) etc.) | DTB hat kein Pendant; LK ist saisonübergreifend | Vereins-Konstrukt | **bewusst** (Spec FR-15a, Anhang A) | Kein Issue, aber in UI sichtbar machen dass ELO/Punkte den Übergang ignorieren |
| C8 | Doppel-Rangliste | Nur Friendlies-Doppel ([friendly.ts](../../server/db/schema/friendly.ts)), keine Rangliste | DTB führt separate Doppel-Ranglisten | Bewusst weggelassen | **bewusst** (Spec § 7) | Kein Issue, v1.5-Kandidat |
| C9 | DTB-LK-Sync | Nur Import per CSV / Admin-API ([member.ts:34](../../server/db/schema/member.ts#L34)); kein Pull | DTB pflegt LK zentral via mybigpoint | Manual-Pflege | **bewusst** (Spec § 7, Roadmap v1.5) | Kein Issue |
| C10 | LK-Wertebereich | `z.number().min(1).max(25)` ([members/types.ts:21](../../server/modules/members/types.ts#L21)) | DTB-LK 2026: `1.0`–`25.0`, dezimal | Stimmt überein | **bewusst** | Kein Issue |
| C11 | LK-Berechnung aus internen Matches | Nicht implementiert | DTB-LK berechnet aus offiziellen Wettkampf­ergebnissen | Bewusst weggelassen | **bewusst** | Kein Issue |
| C12 | „Pausiert"-Status verhindert Challenge | [challenges.ts:93-99](../../server/modules/challenges/service/challenges.ts#L93-L99) | DTB-WSPO: gemeldete Verletzung / Abmeldung pausiert offizielle Wertung | Funktional ähnlich, aber selbst gemanaged | **bewusst** (FR-25c) | Kein Issue |
| C13 | Hybrid-Modus: Position folgt Rating statt Pyramiden-Tausch | [hybrid.ts:76-83](../../server/modules/rankings/strategy/hybrid.ts#L76-L83) — JSDoc selbst markiert es als „v1-Vereinfachung" | (kein DTB-Pendant) | Inkonsistent mit Namen „Hybrid" | **kosmetisch** | Entscheiden: entweder Pyramiden-Tausch implementieren oder Modus klarer benennen |

---

## D. Sonstiges

| ID | Thema | ace-Regel (Code-Ref) | Offizielle Regel | Abweichung | Schweregrad | Empfehlung |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Challenge-Cooldown 14 d | [challenges.ts:23, 132-139](../../server/modules/challenges/service/challenges.ts#L23) | (kein DTB-Pendant) | Vereins-Konstrukt | **bewusst** (FR-26, FR-20d) | Kein Issue |
| D2 | Rate-Limit max 3 neue Challenges/Tag, max 2 aktiv | [challenges.ts:24-25, 112-130](../../server/modules/challenges/service/challenges.ts#L24-L25) | (kein DTB-Pendant) | Vereins-Konstrukt | **bewusst** (FR-27, FR-110, FR-111) | Kein Issue |
| D3 | Friendly-Termin-Konflikt ±2 h | [friendlies.ts:194-210](../../server/modules/friendlies/service/friendlies.ts#L194-L210) | (kein DTB-Pendant) | Vereins-Konstrukt | **bewusst** (Nachtrag N-04) | Kein Issue |
| D4 | Diversitäts-Bonus (Anti-Cherry-Picking) | [points-table.ts:26](../../server/modules/rankings/strategy/points-table.ts#L26) `diversityBonus` (= 1). Vergabe in [applyResult](../../server/modules/rankings/strategy/points-table.ts#L87-L139) **nicht implementiert** — Design-Doc `challenges-results` markiert es als „vereinfacht: kein Bonus initial" | (kein DTB-Pendant) | Vereins-Konstrukt | **bewusst** (Nachtrag N-01) | Kein Regel-Abgleich-Issue. **Echte Spec-Lücke** — N-01 (Zeile 122-123) hält selbst fest, dass die Auslösungs-Bedingung offen ist („wann genau: bei Match-Anlage oder Bestätigung?"). Erfasst als Spec-Refinement-Issue [#33](https://github.com/FrankHalbach/ace/issues/33). |

---

## Befund-Übersicht (verlinkte Issues)

| ID | Schweregrad | Issue | Titel | Cluster |
| --- | --- | --- | --- | --- |
| A1 | kritisch | [#26](https://github.com/FrankHalbach/ace/issues/26) | Set-Score-Plausibilität pro `MatchMode` validieren | Match-Scoring |
| A2 | kritisch | [#27](https://github.com/FrankHalbach/ace/issues/27) | Match-Tie-Break-Format strikt validieren (10 Punkte, 2 Vorsprung) | Match-Scoring |
| A3 | wichtig | [#28](https://github.com/FrankHalbach/ace/issues/28) | Pro-Set-Spielanzahl konfigurierbar & validieren | Match-Scoring |
| A5 | kritisch | [#29](https://github.com/FrankHalbach/ace/issues/29) | Walk-Over modellieren (`MatchOutcome`-Feld) | Match-Verwaltung |
| A6 | kritisch | [#30](https://github.com/FrankHalbach/ace/issues/30) | Aufgabe (`ret.`) modellieren + Teilscore zulassen | Match-Verwaltung |
| A7 | wichtig | [#31](https://github.com/FrankHalbach/ace/issues/31) | Disqualifikation (`def.`) modellieren | Match-Verwaltung |
| C2 | wichtig | [#32](https://github.com/FrankHalbach/ace/issues/32) | `points-table`-Tiebreaker auf LK statt MemberId umstellen (N-01-konform) | Rangliste |

**A4, A8, C13** und der Diversitäts-Bonus-Hinweis aus D4 bleiben kosmetisch / dokumentarisch und bekommen kein Issue. Alle anderen Zeilen sind **bewusste** Abweichungen.

---

## Quellen

- ITF — *Rules of Tennis*: <https://www.itftennis.com/en/about-us/governance/rules-and-regulations/>
- DTB — *Wettspielordnung* (WSPO): <https://www.dtb-tennis.de/Verband/Ordnungen-und-Regelwerke>
- DTB — *Ranglistenordnung* + *LK-Ordnung*: ebd.
- ace — *Spec v1.0*: [`docs/spec/spec-v1.0.html`](../spec/spec-v1.0.html), *Nachträge*: [`docs/spec/nachtraege.md`](../spec/nachtraege.md)
