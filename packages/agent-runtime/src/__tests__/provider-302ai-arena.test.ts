import { describe, expect, it } from 'vitest'

import {
  findArenaPrior,
  findCurrentFastCandidate,
  isLegacyModelId,
  median,
  rankProviderParetoFrontier,
} from '../index'

describe('302.ai Arena-informed Pareto ranking', () => {
  it('matches exact and provider-prefixed current catalog IDs', () => {
    expect(findArenaPrior('gemini-3.7-flash-high')).toMatchObject({ overallRank: 9 })
    expect(findArenaPrior('google/gemini-3.7-flash-high')).toMatchObject({ overallRank: 9 })
    expect(findArenaPrior('unknown-fast-model')).toBeUndefined()
  })

  it('keeps the current Luna candidate separate from variant-specific Arena evidence', () => {
    expect(findCurrentFastCandidate('gpt-5.6-luna')).toMatchObject({
      source: 'official-model-catalog',
    })
    expect(findCurrentFastCandidate('openai/gpt-5.6-luna')).toBeDefined()
    expect(findArenaPrior('gpt-5.6-luna')).toBeUndefined()
    expect(findArenaPrior('gpt-5.6-luna-xhigh')).toMatchObject({ overallRank: 63 })
    expect(findArenaPrior('gpt-5.5-instant')).toBeUndefined()
  })

  it('filters obvious legacy IDs without rejecting current preview naming', () => {
    expect(isLegacyModelId('openai/gpt-4-legacy')).toBe(true)
    expect(isLegacyModelId('anthropic/claude-3-opus')).toBe(true)
    expect(isLegacyModelId('gemini-3.7-flash-high')).toBe(false)
    expect(isLegacyModelId('frontier-preview-fast')).toBe(false)
  })

  it('computes medians for odd and even repeated samples', () => {
    expect(median([30, 10, 20])).toBe(20)
    expect(median([40, 10, 30, 20])).toBe(25)
  })

  it('keeps quality/latency trade-offs and removes dominated models', () => {
    const ranked = rankProviderParetoFrontier([
      {
        modelId: 'gemini-3.7-flash-high',
        arenaOverallRank: 9,
        compatible: true,
        medianLatencyMs: 600,
        medianTtftMs: 150,
      },
      {
        modelId: 'gpt-5.6-luna-xhigh',
        arenaOverallRank: 63,
        compatible: true,
        medianLatencyMs: 250,
        medianTtftMs: 80,
      },
      {
        modelId: 'gemini-3-flash',
        arenaOverallRank: 30,
        compatible: true,
        medianLatencyMs: 700,
        medianTtftMs: 180,
      },
      {
        modelId: 'legacy/model',
        arenaOverallRank: 1,
        compatible: true,
        medianLatencyMs: 1,
        medianTtftMs: 1,
      },
    ])
    expect(ranked.map((model) => [model.modelId, model.pareto])).toEqual([
      ['gemini-3.7-flash-high', true],
      ['gpt-5.6-luna-xhigh', true],
      ['gemini-3-flash', false],
    ])
  })
})
