export interface ArenaQualityPrior {
  modelId: string
  overallRank: number
}

export const ARENA_QUALITY_SOURCE = {
  name: 'LMArena Text Leaderboard',
  observedAt: '2026-08-24',
} as const

export const ARENA_QUALITY_PRIORS: readonly ArenaQualityPrior[] = [
  { modelId: 'gemini-3.7-flash-high', overallRank: 9 },
  { modelId: 'gemini-3-flash', overallRank: 30 },
  { modelId: 'gpt-5.6-luna-xhigh', overallRank: 63 },
]

export interface CurrentFastFrontierCandidate {
  modelId: string
  source: 'official-model-catalog'
}

export const CURRENT_MODEL_SOURCE = {
  name: 'OpenAI API model catalog',
  observedAt: '2026-08-24',
  url: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
} as const

export const CURRENT_FAST_FRONTIER_CANDIDATES: readonly CurrentFastFrontierCandidate[] = [
  { modelId: 'gpt-5.6-luna', source: 'official-model-catalog' },
]

const LEGACY_MODEL_PATTERN =
  /(?:^|[/_.-])(?:legacy|deprecated|gpt-3(?:\.\d+)?|gpt-4(?:\.\d+)?|claude-2(?:\.\d+)?|claude-3(?:\.\d+)?|gemini-1(?:\.\d+)?)(?:[/_.-]|$)/i

export function isLegacyModelId(modelId: string): boolean {
  return LEGACY_MODEL_PATTERN.test(modelId)
}

export function findArenaPrior(modelId: string): ArenaQualityPrior | undefined {
  return ARENA_QUALITY_PRIORS.find((prior) => matchesCatalogModelId(modelId, prior.modelId))
}

export function findCurrentFastCandidate(
  modelId: string,
): CurrentFastFrontierCandidate | undefined {
  return CURRENT_FAST_FRONTIER_CANDIDATES.find((candidate) =>
    matchesCatalogModelId(modelId, candidate.modelId),
  )
}

function matchesCatalogModelId(catalogModelId: string, candidateModelId: string): boolean {
  const normalized = catalogModelId.toLowerCase()
  return (
    normalized === candidateModelId ||
    normalized.endsWith(`/${candidateModelId}`) ||
    normalized.endsWith(`:${candidateModelId}`)
  )
}

export interface ProviderModelEvaluation {
  modelId: string
  arenaOverallRank: number
  compatible: boolean
  medianLatencyMs: number
  medianTtftMs: number
}

export interface RankedProviderModel extends ProviderModelEvaluation {
  pareto: boolean
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('median requires at least one value')
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]!
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}

export function rankProviderParetoFrontier(
  evaluations: readonly ProviderModelEvaluation[],
): RankedProviderModel[] {
  const eligible = evaluations.filter(
    (evaluation) => evaluation.compatible && !isLegacyModelId(evaluation.modelId),
  )
  return eligible
    .map((evaluation) => ({
      ...evaluation,
      pareto: !eligible.some(
        (other) =>
          other.modelId !== evaluation.modelId &&
          other.arenaOverallRank <= evaluation.arenaOverallRank &&
          other.medianLatencyMs <= evaluation.medianLatencyMs &&
          (other.arenaOverallRank < evaluation.arenaOverallRank ||
            other.medianLatencyMs < evaluation.medianLatencyMs),
      ),
    }))
    .sort(
      (left, right) =>
        Number(right.pareto) - Number(left.pareto) ||
        left.arenaOverallRank - right.arenaOverallRank ||
        left.medianLatencyMs - right.medianLatencyMs,
    )
}
