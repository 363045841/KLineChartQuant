import { describe, expect, it, vi } from 'vitest'

import type { SymbolSpec } from '../../../controllers/types'
import {
  ComparisonCommands,
  type ComparisonCommandsDependencies,
  type ComparisonInstrumentResolution,
} from '../comparisonCommands'
import { symbolSpecIdentityKey } from '../symbolIdentity'

const PRIMARY: SymbolSpec = {
  symbol: 'MAIN',
  market: 'CN',
  exchange: 'SSE',
  source: 'mock',
  period: 'daily',
  adjust: 'none',
}

const COMPARISON: SymbolSpec = {
  symbol: 'CMP',
  market: 'CN',
  exchange: 'SSE',
  source: 'mock',
  period: 'daily',
  adjust: 'none',
}

function createHarness(initialComparisons: ReadonlyArray<SymbolSpec> = []) {
  let specs = initialComparisons.map((spec) => ({ ...spec }))
  const setSpecs = vi.fn((next: ReadonlyArray<SymbolSpec>) => {
    specs = next.map((spec) => ({ ...spec }))
  })
  const setComparisonViewActive = vi.fn()
  const scheduleDraw = vi.fn()
  const validateSpec = vi.fn()
  const registerSpec = vi.fn()
  const resolveInstrument = vi.fn(
    async (query: { symbol: string }): Promise<ComparisonInstrumentResolution> => ({
      candidates: [
        {
          id: `${query.symbol}-ID`,
          sourceId: 'mock',
          symbol: query.symbol,
          name: `${query.symbol} 名称`,
          assetClass: 'stock',
          exchange: 'SSE',
          sessionId: 'CN',
          capabilities: {},
        },
      ],
      searchedSourceIds: ['mock'],
      foundElsewhereSourceIds: [],
    }),
  )
  const colors = new Map<string, string>()
  const dependencies: ComparisonCommandsDependencies = {
    getSpecs: () => specs,
    setSpecs,
    setComparisonViewActive,
    validateSpec,
    registerSpec,
    resolveInstrument,
    getColor: (identity) => colors.get(identity),
    scheduleDraw,
  }
  return {
    commands: new ComparisonCommands(dependencies),
    setSpecs,
    setComparisonViewActive,
    scheduleDraw,
    validateSpec,
    registerSpec,
    resolveInstrument,
    colors,
    specs: () => specs,
  }
}

describe('ComparisonCommands', () => {
  it('creates a comparison without a primary symbol and activates the comparison view', async () => {
    const harness = createHarness()

    await harness.commands.create({ symbol: 'CMP' })

    expect(harness.validateSpec).toHaveBeenCalledOnce()
    expect(harness.specs().map((spec) => spec.symbol)).toEqual(['CMP'])
    expect(harness.setComparisonViewActive).toHaveBeenCalledWith(true)
    expect(harness.scheduleDraw).toHaveBeenCalledOnce()
  })

  it('resolves the comparison instrument and applies its routing fields', async () => {
    const harness = createHarness()

    await expect(
      harness.commands.create({ symbol: 'CMP', primary: { source: 'mock' } }),
    ).resolves.toEqual({
      status: 'added',
      symbol: 'CMP',
      name: 'CMP 名称',
    })

    expect(harness.resolveInstrument).toHaveBeenCalledWith({ symbol: 'CMP', source: 'mock' })
    const comparison = harness.specs()[0]
    expect(comparison?.id).toBe('CMP-ID')
    expect(comparison?.exchange).toBe('SSE')
    expect(comparison?.market).toBe('CN')
    expect(comparison?.source).toBe('mock')
    expect(comparison?.instrument?.exchange).toBe('SSE')
  })

  it('does not inherit the primary exchange when the instrument resolves to another exchange', async () => {
    const harness = createHarness()
    harness.resolveInstrument.mockResolvedValueOnce({
      candidates: [
        {
          id: 'CMP-ID',
          sourceId: 'mock',
          symbol: 'CMP',
          name: 'CMP 名称',
          assetClass: 'stock',
          exchange: 'SH',
          capabilities: {},
        },
      ],
      searchedSourceIds: ['mock'],
      foundElsewhereSourceIds: [],
    })

    await harness.commands.create({ symbol: 'CMP', primary: { ...PRIMARY, exchange: 'SZ' } })

    expect(harness.specs()[0]?.exchange).toBe('SH')
  })

  it('throws a not-found error carrying the searched sources when the symbol cannot be resolved', async () => {
    const harness = createHarness()
    harness.resolveInstrument.mockResolvedValueOnce({
      candidates: [],
      searchedSourceIds: ['mock'],
      foundElsewhereSourceIds: [],
    })

    await expect(harness.commands.create({ symbol: 'UNKNOWN' })).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_FOUND',
      message: expect.stringContaining('No instrument matched symbol "UNKNOWN". Searched mock.'),
    })
    expect(harness.setSpecs).not.toHaveBeenCalled()
  })

  it('points at the other source when the symbol exists outside the searched source', async () => {
    const harness = createHarness()
    harness.resolveInstrument.mockResolvedValueOnce({
      candidates: [],
      searchedSourceIds: ['mock'],
      foundElsewhereSourceIds: ['alt'],
    })

    await expect(harness.commands.create({ symbol: 'CMP' })).rejects.toMatchObject({
      message: expect.stringContaining('It exists in: alt.'),
    })
  })

  it('returns an ambiguous result without writing when one code matches several instruments', async () => {
    const harness = createHarness()
    harness.resolveInstrument.mockResolvedValueOnce({
      candidates: [
        {
          id: 'stock:0:000012',
          sourceId: 'gotdx',
          symbol: '000012',
          name: '南玻A',
          assetClass: 'stock',
          exchange: 'SZ',
          capabilities: {},
        },
        {
          id: 'index:0:000012',
          sourceId: 'gotdx',
          symbol: '000012',
          name: '国债指数',
          assetClass: 'index',
          exchange: 'SH',
          capabilities: {},
        },
      ],
      searchedSourceIds: ['gotdx'],
      foundElsewhereSourceIds: [],
    })

    await expect(harness.commands.create({ symbol: '000012', source: 'gotdx' })).resolves.toEqual({
      status: 'ambiguous',
      message: expect.stringContaining('ask_user'),
      candidates: [
        {
          id: 'stock:0:000012',
          sourceId: 'gotdx',
          symbol: '000012',
          name: '南玻A',
          exchange: 'SZ',
          assetClass: 'stock',
        },
        {
          id: 'index:0:000012',
          sourceId: 'gotdx',
          symbol: '000012',
          name: '国债指数',
          exchange: 'SH',
          assetClass: 'index',
        },
      ],
    })
    expect(harness.setSpecs).not.toHaveBeenCalled()
  })

  it('adds the single candidate narrowed by assetClass without leaking the filter into the spec', async () => {
    const harness = createHarness()
    harness.resolveInstrument.mockResolvedValueOnce({
      candidates: [
        {
          id: 'stock:0:000012',
          sourceId: 'gotdx',
          symbol: '000012',
          name: '南玻A',
          assetClass: 'stock',
          exchange: 'SZ',
          capabilities: {},
        },
        {
          id: 'index:0:000012',
          sourceId: 'gotdx',
          symbol: '000012',
          name: '国债指数',
          assetClass: 'index',
          exchange: 'SH',
          sessionId: 'CN',
          capabilities: {},
        },
      ],
      searchedSourceIds: ['gotdx'],
      foundElsewhereSourceIds: [],
    })

    await expect(
      harness.commands.create({ symbol: '000012', source: 'gotdx', assetClass: 'index' }),
    ).resolves.toMatchObject({ status: 'added', name: '国债指数' })

    const comparison = harness.specs()[0]
    expect(comparison?.id).toBe('index:0:000012')
    expect(comparison?.exchange).toBe('SH')
    expect(comparison).not.toHaveProperty('assetClass')
  })

  it('lists the actual candidate combinations when user filters exclude every match', async () => {
    const harness = createHarness()
    harness.resolveInstrument.mockResolvedValueOnce({
      candidates: [
        {
          id: 'stock:0:000012',
          sourceId: 'gotdx',
          symbol: '000012',
          name: '南玻A',
          assetClass: 'stock',
          exchange: 'SZ',
          capabilities: {},
        },
      ],
      searchedSourceIds: ['gotdx'],
      foundElsewhereSourceIds: [],
    })

    await expect(
      harness.commands.create({ symbol: '000012', source: 'gotdx', assetClass: 'index' }),
    ).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_FOUND',
      message: expect.stringContaining('stock@SZ "南玻A"'),
    })
    expect(harness.setSpecs).not.toHaveBeenCalled()
  })

  it('throws a duplicate error without writing specs', async () => {
    const harness = createHarness([COMPARISON])

    await expect(harness.commands.create({ symbol: 'CMP' })).rejects.toMatchObject({
      code: 'COMPARISON_DUPLICATE',
    })
    expect(harness.setSpecs).not.toHaveBeenCalled()
  })

  it('registers the comparison before committing specs', async () => {
    const harness = createHarness()

    await harness.commands.create({ symbol: 'CMP' })

    expect(harness.registerSpec).toHaveBeenCalledOnce()
    expect(harness.registerSpec.mock.invocationCallOrder[0]).toBeLessThan(
      harness.setSpecs.mock.invocationCallOrder[0],
    )
  })

  it('preserves the full spec passed to add and fills only missing fields from the primary', () => {
    const primary: SymbolSpec = { ...PRIMARY, id: 'PRIMARY-ID', startDate: '2020-01-01' }
    const harness = createHarness()
    const rich: SymbolSpec = {
      id: 'CMP-ID',
      instrument: {
        id: 'CMP-ID',
        sourceId: 'mock',
        symbol: 'CMP',
        name: 'CMP 名称',
        assetClass: 'stock',
        exchange: 'SSE',
        capabilities: {},
      },
      symbol: 'CMP',
      market: 'CN',
      params: { code: 'CMP' },
      period: 'weekly',
    }

    expect(harness.commands.add(rich, primary)).toBe(true)
    expect(harness.specs()[0]).toEqual({
      ...rich,
      exchange: 'SSE',
      source: 'mock',
      adjust: 'none',
      startDate: '2020-01-01',
    })
    expect(harness.specs()[0]?.id).toBe('CMP-ID')
    expect(harness.specs()[0]?.params).toEqual({ code: 'CMP' })
  })

  it('rejects a comparison whose symbol already exists under another identity', () => {
    const harness = createHarness([{ ...COMPARISON, id: 'CMP-ID' }])

    expect(harness.commands.add({ symbol: 'CMP', market: 'CN', exchange: 'SSE' })).toBe(false)
    expect(harness.setSpecs).not.toHaveBeenCalled()
  })

  it('validates the spec before committing specs', () => {
    const harness = createHarness()
    harness.validateSpec.mockImplementation(() => {
      throw new Error('Market session is not registered: FUTURES')
    })

    expect(() => harness.commands.add({ symbol: 'CMP', market: 'FUTURES' })).toThrow(
      'Market session is not registered: FUTURES',
    )
    expect(harness.setSpecs).not.toHaveBeenCalled()
  })

  it('keeps the comparison view while other comparisons remain', () => {
    const harness = createHarness([COMPARISON, { ...COMPARISON, symbol: 'SECOND' }])

    expect(harness.commands.remove({ identity: 'CMP' })).toBe(true)
    expect(harness.specs().map((spec) => spec.symbol)).toEqual(['SECOND'])
    expect(harness.setComparisonViewActive).not.toHaveBeenCalled()
  })

  it('removes the last comparison and leaves the comparison view', () => {
    const harness = createHarness([COMPARISON])

    expect(harness.commands.remove({ identity: symbolSpecIdentityKey(COMPARISON) })).toBe(true)
    expect(harness.specs()).toEqual([])
    expect(harness.setComparisonViewActive).toHaveBeenCalledWith(false)
    expect(harness.scheduleDraw).toHaveBeenCalledOnce()
  })

  it('ignores an unknown removal target', () => {
    const harness = createHarness([COMPARISON])

    expect(harness.commands.remove({ identity: 'missing' })).toBe(false)
    expect(harness.setSpecs).not.toHaveBeenCalled()
  })

  it('clears every comparison and reports the removed count', () => {
    const harness = createHarness([COMPARISON, { ...COMPARISON, symbol: 'SECOND' }])

    expect(harness.commands.clear()).toBe(2)
    expect(harness.specs()).toEqual([])
    expect(harness.setComparisonViewActive).toHaveBeenCalledWith(false)
  })

  it('does not clear when no comparison exists', () => {
    const harness = createHarness()

    expect(harness.commands.clear()).toBe(0)
    expect(harness.setSpecs).not.toHaveBeenCalled()
  })

  it('lists identities, specs, and assigned colors', () => {
    const harness = createHarness([COMPARISON])
    harness.colors.set(symbolSpecIdentityKey(COMPARISON), '#f59e0b')

    expect(harness.commands.list()).toEqual([
      {
        identity: symbolSpecIdentityKey(COMPARISON),
        spec: COMPARISON,
        color: '#f59e0b',
      },
    ])
  })
})
