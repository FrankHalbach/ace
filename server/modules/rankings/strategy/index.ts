import { eloStrategy } from './elo'
import { hybridStrategy } from './hybrid'
import { pointsTableStrategy } from './points-table'
import { pyramidStrategy } from './pyramid'
import type { RankingMode, RankingStrategy } from './types'

const STRATEGIES: Record<RankingMode, RankingStrategy> = {
  pyramid: pyramidStrategy,
  elo: eloStrategy,
  hybrid: hybridStrategy,
  'points-table': pointsTableStrategy,
}

export function strategyFor(mode: RankingMode): RankingStrategy {
  return STRATEGIES[mode]
}

export type {
  DisplayInfo,
  EntryDisplayInput,
  InitialEntryFields,
  InitialOrderInput,
  RankingConfig,
  RankingMode,
  RankingStrategy,
  TransitionStrategy,
} from './types'
