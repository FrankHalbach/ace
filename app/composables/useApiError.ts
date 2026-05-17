/**
 * Übersetzt Server-Error-Codes (`statusMessage`) in menschenlesbaren
 * deutschen Text. Wenn der Code unbekannt ist, fällt sie auf den Code
 * selbst zurück — das hilft beim Debuggen, ohne die UI zu brechen.
 */
const MESSAGES: Record<string, string> = {
  // Friendlies
  'friendly.not-found': 'Freundschaftsspiel nicht gefunden.',
  'friendly.not-participant': 'Du bist kein Teilnehmer dieses Matches.',
  'friendly.invalid-transition': 'Diese Aktion ist im aktuellen Status nicht möglich.',
  'friendly.before-scheduled': 'Das Match liegt noch in der Zukunft — Ergebnis erst nach dem Termin eintragen.',
  'friendly.has-pending-result': 'Es liegt schon ein gemeldetes Ergebnis vor — Absagen ist nicht mehr möglich.',
  'friendly.schedule-conflict': 'Termin-Konflikt: zu dieser Zeit gibt es schon ein anderes Match.',
  'friendly.scheduled-in-past': 'Der gewählte Termin liegt zu weit in der Vergangenheit.',
  'friendly.not-winner': 'Nur Spieler aus dem Sieger-Team dürfen das Ergebnis melden.',
  'friendly.not-loser': 'Nur Spieler aus dem Verlierer-Team dürfen bestätigen oder widersprechen.',
  'friendly.invalid-set-shape': 'Die eingegebenen Sätze passen nicht zum Match-Modus.',
  'friendly.same-member': 'Du kannst dich nicht selbst einladen.',
  'friendly.duplicate-member': 'Ein Spieler kommt mehrfach im Team vor.',
  'friendly.invalid-team-shape': 'Team-Aufstellung passt nicht zum Format.',
  'friendly.target-pausiert': 'Der eingeladene Spieler ist pausiert.',
  'friendly.too-many-today': 'Maximal 5 neue Freundschaftsspiele pro Tag.',
  'friendly-result.already-confirmed': 'Das Ergebnis wurde bereits bestätigt.',
  'friendly-result.not-found': 'Ergebnis nicht gefunden.',

  // Challenges
  'challenge.not-found': 'Forderung nicht gefunden.',
  'challenge.not-participant': 'Du bist kein Teilnehmer dieser Forderung.',
  'challenge.invalid-transition': 'Diese Aktion ist im aktuellen Status nicht möglich.',
  'challenge.has-pending-result': 'Es liegt schon ein gemeldetes Ergebnis vor.',

  // Match-Results
  'result.invalid-sets': 'Die eingegebenen Sätze sind nicht zulässig.',
  'result.not-winner-or-loser': 'Nur Teilnehmer der Forderung dürfen ein Ergebnis melden.',
  'result.not-loser': 'Nur der Verlierer darf bestätigen oder widersprechen.',
  'result.already-confirmed': 'Das Ergebnis wurde bereits bestätigt.',
  'result.challenge-not-accepted': 'Forderung ist nicht im Status „angenommen".',
  'result.not-found': 'Ergebnis nicht gefunden.',

  // Seasons / Admin
  'season.not-found': 'Saison nicht gefunden.',
  'season.frozen': 'Saison ist nicht mehr im Status „Geplant" — Änderungen blockiert.',
  'season.name-taken': 'Eine Saison mit diesem Namen existiert bereits.',
  'season.invalid-transition': 'Status-Wechsel der Saison nicht möglich.',
  'age-group.not-found': 'Altersgruppe nicht gefunden.',
  'age-group.name-taken': 'Eine Altersgruppe mit diesem Namen existiert in dieser Saison schon.',

  // Auth / Rollen
  'auth.role-required': 'Du hast nicht die nötige Berechtigung.',
  'auth.rate-limit-exceeded': 'Zu viele Versuche — bitte später erneut probieren.',
  'auth.invalid-token': 'Der Magic-Link ist ungültig oder abgelaufen.',

  // Ranking
  'ranking.not-found': 'Rangliste nicht gefunden.',
}

/**
 * Übersetzt einen API-Fehler in menschenlesbaren Text.
 *
 * @example
 *   try { ... }
 *   catch (err) { toast.add({ title: 'Fehler', description: apiError(err), color: 'error' }) }
 */
export function apiError(err: unknown): string {
  const statusMessage = (err as { statusMessage?: string })?.statusMessage
  if (statusMessage && MESSAGES[statusMessage]) return MESSAGES[statusMessage]
  if (statusMessage) return statusMessage // unbekannter Code — wenigstens nicht stumm
  if (err instanceof Error) return err.message
  return 'Unbekannter Fehler'
}
