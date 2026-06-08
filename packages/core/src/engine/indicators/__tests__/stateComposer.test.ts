import { describe, expect, it, vi } from 'vitest'
import type { IndicatorMetadata } from '../indicatorMetadata'
import { composeRenderStates, composeVisibleSubIndicatorStates, computeMainIndicatorPriceRange } from '../stateComposer'
import type { IndicatorSeriesBundle } from '../workerProtocol'

function createBundle(): IndicatorSeriesBundle {
  return {
    ma: { series: {}, enabledPeriods: [] },
    boll: { series: [], params: {} as never },
    expma: { series: [], params: {} as never },
    ene: { series: [], params: {} as never },
    rsi: { series: {}, enabledPeriods: [], params: {} as never },
    cci: { series: [], params: {} as never },
    stoch: { series: [], params: {} as never },
    mom: { series: [], params: {} as never },
    wmsr: { series: [], params: {} as never },
    kst: { series: [], params: {} as never },
    fastk: { series: [], params: {} as never },
    macd: { series: [], params: {} as never },
    atr: { series: [], params: {} as never },
    wma: { series: [], params: {} as never },
    dema: { series: [], params: {} as never },
    tema: { series: [], params: {} as never },
    hma: { series: [], params: {} as never },
    kama: { series: [], params: {} as never },
    sar: { series: [], params: {} as never },
    supertrend: { series: [], params: {} as never },
    keltner: { series: [], params: {} as never },
    donchian: { series: [], params: {} as never },
    ichimoku: { series: [], params: {} as never },
    roc: { series: [], params: {} as never },
    trix: { series: [], signalSeries: [], params: {} as never },
    hv: { series: [], params: {} as never },
    parkinson: { series: [], params: {} as never },
    chaikinVol: { series: [], params: {} as never },
    vma: { series: [], params: {} as never },
    obv: { series: [], params: {} as never },
    pvt: { series: [], params: {} as never },
    vwap: { series: [], params: {} as never },
    cmf: { series: [], params: {} as never },
    mfi: { series: [], params: {} as never },
    pivot: { series: [], params: {} as never },
    fib: { series: [], params: {} as never },
    structure: { series: { swings: [], breakouts: [] }, params: {} as never },
    zones: { series: [], params: {} as never },
    volumeProfile: { series: { bins: [], vah: 0, val: 0, poc: 0 }, params: {} as never },
    _changed: [],
  }
}

function createDefinition(range: { min: number; max: number } | null): IndicatorMetadata {
  return {
    name: 'test',
    displayName: 'Test',
    category: 'main',
    stateKey: 'indicator:test:main',
    defaultPaneId: 'main',
    rendererFactory: vi.fn() as never,
    mainPane: {
      rendererName: 'test',
      computePriceRange: vi.fn(() => range),
    },
  }
}

function createComposerDefinition(id: string, state: unknown): IndicatorMetadata {
  return {
    name: id,
    displayName: id.toUpperCase(),
    category: 'main',
    stateKey: `indicator:${id}:main`,
    defaultPaneId: 'main',
    rendererFactory: vi.fn() as never,
    mainPane: {
      rendererName: id,
      composeRenderState: vi.fn(() => state),
    },
  }
}

function createVisibleStateDefinition(id: string, state: unknown): IndicatorMetadata {
  return {
    name: id,
    displayName: id.toUpperCase(),
    category: 'oscillator',
    stateKey: `indicator:${id}:sub_${id}`,
    defaultPaneId: `sub_${id}`,
    rendererFactory: vi.fn() as never,
    visibleState: {
      compose: vi.fn(() => state),
    },
  }
}

describe('stateComposer', () => {
  it('computes main indicator price range through metadata', () => {
    const definitions = new Map<string, IndicatorMetadata>([
      ['ma', createDefinition({ min: 10, max: 20 })],
      ['boll', createDefinition({ min: 5, max: 30 })],
    ])

    const range = computeMainIndicatorPriceRange(
      createBundle(),
      { start: 1, end: 3 },
      new Set(['ma', 'boll']),
      (indicatorId) => definitions.get(indicatorId),
    )

    expect(range).toEqual({ min: 5, max: 30 })
    expect(definitions.get('ma')?.mainPane?.computePriceRange).toHaveBeenCalledWith(createBundle(), { start: 1, end: 3 })
  })

  it('ignores inactive or missing main price range metadata', () => {
    const definitions = new Map<string, IndicatorMetadata>([
      ['ma', createDefinition(null)],
      ['boll', { ...createDefinition({ min: 1, max: 2 }), mainPane: { rendererName: 'boll' } }],
    ])

    expect(
      computeMainIndicatorPriceRange(
        createBundle(),
        { start: 0, end: 1 },
        new Set(['ma', 'boll', 'missing']),
        (indicatorId) => definitions.get(indicatorId),
      ),
    ).toBeNull()
  })

  it('composes main render states through metadata', () => {
    const bundle = createBundle()
    const timestamp = 1234
    const visibleRange = { start: 1, end: 3 }
    const definitions = new Map<string, IndicatorMetadata>([
      ['ma', createComposerDefinition('ma', { timestamp, series: { 5: [undefined, 10, 12] }, enabledPeriods: [5], visibleMin: 10, visibleMax: 12 })],
      ['boll', createComposerDefinition('boll', { timestamp, series: [], params: {}, visibleMin: 20, visibleMax: 30 })],
      ['expma', createComposerDefinition('expma', { timestamp, series: [], params: {}, visibleMin: 7, visibleMax: 9 })],
      ['ene', createComposerDefinition('ene', { timestamp, series: [], params: {}, visibleMin: 8, visibleMax: 11 })],
    ])

    const states = composeRenderStates(bundle, visibleRange, timestamp, (indicatorId) => definitions.get(indicatorId))

    expect(states.ma.visibleMin).toBe(10)
    expect(states.boll.visibleMax).toBe(30)
    expect(states.expma.visibleMin).toBe(7)
    expect(states.ene.visibleMax).toBe(11)
    expect(definitions.get('ma')?.mainPane?.composeRenderState).toHaveBeenCalledWith(bundle, visibleRange, timestamp)
  })

  it('throws when main render state composer metadata is missing', () => {
    const definition = { ...createDefinition(null), mainPane: { rendererName: 'ma' } }

    expect(() => composeRenderStates(createBundle(), { start: 0, end: 1 }, 1, (id) => id === 'ma' ? definition : undefined)).toThrow(
      '[StateComposer] Missing mainPane.composeRenderState for ma',
    )
  })

  it('composes migrated visible sub indicator states through metadata', () => {
    const bundle = createBundle()
    const timestamp = 2345
    const visibleRange = { start: 1, end: 4 }
    const wmaState = {
      timestamp,
      series: [undefined, 10, 12],
      params: { showWMA: true },
      valueMin: 9,
      valueMax: 13,
      visibleMin: 10,
      visibleMax: 12,
    }
    const definition = createVisibleStateDefinition('wma', wmaState)

    const states = composeVisibleSubIndicatorStates(
      bundle,
      visibleRange,
      timestamp,
      { wma: false },
      (indicatorId) => indicatorId === 'wma' ? definition : undefined,
    )

    expect(states.wma).toBe(wmaState)
    expect(definition.visibleState?.compose).toHaveBeenCalledWith({
      bundle,
      visibleRange,
      timestamp,
      active: false,
    })
  })

  it('falls back to hardcoded visible sub state when metadata is missing', () => {
    const bundle = createBundle()
    bundle.wma.series = [undefined, 10, 12]
    bundle.wma.params = { period: 9, showWMA: true } as never

    const states = composeVisibleSubIndicatorStates(bundle, { start: 1, end: 3 }, 3456)

    expect(states.wma.visibleMin).toBe(10)
    expect(states.wma.visibleMax).toBe(12)
  })

  it('routes 8C-B indicators through metadata visible state composer', () => {
    const bundle = createBundle()
    const timestamp = 1000
    const visibleRange = { start: 1, end: 4 }
    const fastkState = { timestamp, series: [undefined, 10], params: { period: 9, showFASTK: true }, valueMin: 0, valueMax: 100, visibleMin: 10, visibleMax: 10 }

    const definition = createVisibleStateDefinition('fastk', fastkState)
    const states = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp, { fastk: true }, (id) => id === 'fastk' ? definition : undefined)

    expect(states.fastk).toBe(fastkState)
    expect(definition.visibleState?.compose).toHaveBeenCalledWith({ bundle, visibleRange, timestamp, active: true })
  })

  it('falls back to hardcoded state for 8C-B when metadata is missing', () => {
    const bundle = createBundle()
    bundle.fastk.series = [undefined, 15, 25]
    bundle.fastk.params = { period: 9, showFASTK: true } as never

    const states = composeVisibleSubIndicatorStates(bundle, { start: 1, end: 3 }, 2000)

    expect(states.fastk.valueMin).toBe(0)
    expect(states.fastk.valueMax).toBe(100)
    expect(states.fastk.visibleMin).toBe(15)
    expect(states.fastk.visibleMax).toBe(25)
  })
})
