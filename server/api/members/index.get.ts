import { profileService } from '../../modules/members'

/**
 * GET /api/members — Schmale Liste aller Mitglieder für Picker (Friendly-Auswahl,
 * spätere Suche). Bewusst nur Felder, die ein anderes Mitglied ohnehin im
 * Verein sehen würde — Email bewusst weggelassen (FR-7 wird mit dem
 * Sichtbarkeits-Feature voll ausgebaut).
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  return profileService.listAll().map((m) => ({
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    gender: m.gender,
    dtbLk: m.dtbLk,
    status: m.status,
  }))
})
