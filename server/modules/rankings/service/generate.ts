import { profileService, type MemberDto } from '../../members'
import { seasonsService } from '../../seasons'
import type { AgeGroupDto, SeasonDetailDto } from '../../seasons'
import { rankingEntryRepo } from '../repository/ranking-entry-repo'
import { rankingRepo } from '../repository/ranking-repo'
import { strategyFor } from '../strategy'
import type { RankingConfig, RankingMode, RankingVariant, SeasonId } from '../types'

/**
 * Erzeugt für eine Saison alle Ranglisten und füllt sie mit den passenden
 * Mitgliedern.
 *
 * Wird vom seasonsService.start() aufgerufen. Idempotent: läuft die Funktion
 * doppelt, werden die bestehenden Ranglisten erkannt und übersprungen
 * (keine Duplicate-Key-Errors, kein doppeltes Eintragen).
 */
export function generateForSeason(seasonId: SeasonId): { rankingsCreated: number; entriesCreated: number } {
  const detail = seasonsService.getDetail(seasonId)
  const allMembers = profileService.listAll()

  // Modus pro Rangliste: Default Pyramide; Season.config.defaultMode
  // (falls gesetzt) überschreibt für *alle* Ranglisten dieser Saison.
  const defaultMode = pickDefaultMode(detail)
  const ageYear = detail.startedAt?.getFullYear() ?? new Date().getFullYear()

  let rankingsCreated = 0
  let entriesCreated = 0

  for (const ageGroup of detail.ageGroups) {
    if (!ageGroup.active) continue
    const variants = variantsForGenderRule(ageGroup.genderRule)

    for (const variant of variants) {
      // Idempotenz: schon vorhanden?
      const existing = rankingRepo.findExact(seasonId, ageGroup.id, variant)
      if (existing) continue

      const matching = allMembers.filter((m) => fitsInRanking(m, ageGroup, variant, ageYear))
      const strategy = strategyFor(defaultMode)
      const config: RankingConfig = strategy.defaultConfig()

      const rankingRow = rankingRepo.insert({
        seasonId,
        ageGroupId: ageGroup.id,
        variant,
        mode: defaultMode,
        config,
      })
      rankingsCreated++

      if (matching.length === 0) continue
      const orderedIds = strategy.getInitialOrder({
        members: matching,
        transition: 'reset', // erste Saison: immer reset
      })

      const memberById = new Map(matching.map((m) => [m.id, m]))
      const entries = orderedIds.map((memberId, idx) => {
        const member = memberById.get(memberId)!
        const initFields = strategy.initialEntryFields(member)
        return {
          rankingId: rankingRow.id,
          memberId,
          position: idx + 1,
          points: initFields.points ?? null,
          eloRating: initFields.eloRating ?? null,
          lastMatchAt: null,
        }
      })
      rankingEntryRepo.insertMany(entries)
      entriesCreated += entries.length
    }
  }

  return { rankingsCreated, entriesCreated }
}

function variantsForGenderRule(rule: AgeGroupDto['genderRule']): RankingVariant[] {
  switch (rule) {
    case 'mixed':
      return ['offen']
    case 'separate':
      return ['herren', 'damen']
    case 'both':
      return ['herren', 'damen', 'offen']
  }
}

function fitsInRanking(
  member: MemberDto,
  ageGroup: AgeGroupDto,
  variant: RankingVariant,
  ageYear: number,
): boolean {
  // Geschlechts-Match
  if (variant === 'herren' && member.gender !== 'm') return false
  if (variant === 'damen' && member.gender !== 'w') return false
  // variant === 'offen' nimmt alle Geschlechter

  // Alters-Match
  const age = ageYear - member.birthYear
  if (ageGroup.minAge !== null && age < ageGroup.minAge) return false
  if (ageGroup.maxAge !== null && age > ageGroup.maxAge) return false

  return true
}

/**
 * Konvention: Default ist Pyramide. Per `Season.config.defaultMode` global
 * überschreibbar. Eine feinere per-AgeGroup-Wahl folgt in einem späteren
 * Admin-Feature.
 */
function pickDefaultMode(detail: SeasonDetailDto): RankingMode {
  const override = detail.config?.defaultMode
  if (
    override === 'pyramid' ||
    override === 'elo' ||
    override === 'hybrid' ||
    override === 'points-table'
  ) {
    return override
  }
  return 'pyramid'
}
