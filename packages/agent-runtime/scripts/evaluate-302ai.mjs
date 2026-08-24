import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  ARENA_QUALITY_PRIORS,
  ARENA_QUALITY_SOURCE,
  CURRENT_FAST_FRONTIER_CANDIDATES,
  CURRENT_MODEL_SOURCE,
  DEFAULT_302AI_BASE_URL,
  InMemoryProviderCredentialStore,
  InMemoryProviderSettingsStore,
  create302AiRuntimeSupport,
  findArenaPrior,
  findCurrentFastCandidate,
  isLegacyModelId,
  median,
  rankProviderParetoFrontier,
} from '../dist/index.js'

const apiKey = process.env.KQ_302AI_API_KEY
const baseUrl = process.env.KQ_LLM_BASE_URL || DEFAULT_302AI_BASE_URL
const explicitModel = process.env.KQ_LLM_MODEL
const runs = Math.max(3, Math.min(5, Number(process.env.KQ_LIVE_RUNS || 3)))
const maxCandidates = Math.max(1, Math.min(5, Number(process.env.KQ_LIVE_MAX_CANDIDATES || 3)))
const reportPath = process.env.KQ_302AI_REPORT_PATH

async function publish(report) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`
  if (reportPath) {
    await mkdir(dirname(reportPath), { recursive: true })
    await writeFile(reportPath, serialized, { encoding: 'utf8', mode: 0o600 })
  }
  process.stdout.write(serialized)
}

if (!apiKey) {
  await publish({
    status: 'skipped',
    reason: 'KQ_302AI_API_KEY is not exported.',
    arenaQualitySource: ARENA_QUALITY_SOURCE,
    currentModelSource: CURRENT_MODEL_SOURCE,
    currentCandidates: CURRENT_FAST_FRONTIER_CANDIDATES,
    generatedAt: new Date().toISOString(),
  })
  process.exit(0)
}

const credentials = new InMemoryProviderCredentialStore()
const settings = new InMemoryProviderSettingsStore()
const support = create302AiRuntimeSupport({ credentials, settings })
const catalog = await support.provider.listModels({ baseUrl, apiKey })
const candidates = catalog.models
  .filter((model) => !isLegacyModelId(model.id))
  .map((model) => ({
    model,
    prior: findArenaPrior(model.id),
    currentCandidate: findCurrentFastCandidate(model.id),
  }))
  .filter((candidate) => candidate.prior || candidate.currentCandidate)
  .filter((candidate) => !explicitModel || candidate.model.id === explicitModel)
  .sort(
    (left, right) =>
      Number(Boolean(right.currentCandidate)) - Number(Boolean(left.currentCandidate)) ||
      (left.prior?.overallRank ?? Number.MAX_SAFE_INTEGER) -
        (right.prior?.overallRank ?? Number.MAX_SAFE_INTEGER),
  )
  .slice(0, maxCandidates)

const evaluations = []
const failures = []
for (const candidate of candidates) {
  const latencies = []
  const ttfts = []
  try {
    for (let run = 0; run < runs; run += 1) {
      const result = await support.provider.test({
        baseUrl,
        apiKey,
        model: candidate.model.id,
      })
      latencies.push(result.latencyMs)
      ttfts.push(result.ttftMs ?? result.latencyMs)
    }
    evaluations.push({
      modelId: candidate.model.id,
      arenaOverallRank: candidate.prior?.overallRank ?? null,
      evidence: candidate.prior ? 'arena-ranked' : 'current-unranked',
      compatible: true,
      medianLatencyMs: median(latencies),
      medianTtftMs: median(ttfts),
    })
  } catch (error) {
    failures.push({
      modelId: candidate.model.id,
      arenaOverallRank: candidate.prior?.overallRank ?? null,
      evidence: candidate.prior ? 'arena-ranked' : 'current-unranked',
      code: typeof error === 'object' && error && 'code' in error ? error.code : 'PROVIDER_ERROR',
    })
  }
}

const ranked = rankProviderParetoFrontier(
  evaluations.filter((evaluation) => evaluation.arenaOverallRank !== null),
)
const rankedByModelId = new Map(ranked.map((evaluation) => [evaluation.modelId, evaluation]))
const reportedEvaluations = evaluations.map((evaluation) =>
  evaluation.arenaOverallRank === null
    ? { ...evaluation, pareto: null }
    : rankedByModelId.get(evaluation.modelId),
)
const report = {
  status: reportedEvaluations.length ? 'completed' : 'no-compatible-candidates',
  generatedAt: new Date().toISOString(),
  baseUrl,
  runsPerModel: runs,
  catalogSize: catalog.models.length,
  arenaQualitySource: ARENA_QUALITY_SOURCE,
  arenaPriors: ARENA_QUALITY_PRIORS,
  currentModelSource: CURRENT_MODEL_SOURCE,
  currentCandidates: CURRENT_FAST_FRONTIER_CANDIDATES,
  evaluated: reportedEvaluations,
  paretoModelIds: ranked.filter((model) => model.pareto).map((model) => model.modelId),
  failures,
}
await publish(report)
if (!reportedEvaluations.length) process.exitCode = 1
