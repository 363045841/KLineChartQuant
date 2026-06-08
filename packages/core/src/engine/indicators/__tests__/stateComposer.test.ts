import { describe, expect, it, vi } from 'vitest'
import type { IndicatorMetadata } from '../indicatorMetadata'
import { composeRenderStates, composeVisibleSubIndicatorStates, computeMainIndicatorPriceRange } from '../stateComposer'
import type { IndicatorSeriesBundle } from '../workerProtocol'
import '../registerBuiltins'
import { getRegisteredIndicatorDefinition } from '../indicatorDefinitionRegistry'

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

function getComposerMetadata(id: string): IndicatorMetadata | undefined {
  return getRegisteredIndicatorDefinition(id)
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









  it('applies symmetric abs padding for MOM via metadata composer', () => {
    const bundle = createBundle()
    bundle.mom.series = [undefined, -2, 4]
    bundle.mom.params = { period: 10, showMOM: true } as never
    const timestamp = 1000
    const visibleRange = { start: 1, end: 3 }

    const states = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp, { mom: true }, getComposerMetadata)

    expect(states.mom.visibleMin).toBe(-2)
    expect(states.mom.visibleMax).toBe(4)
    expect(states.mom.valueMin).toBeCloseTo(-2.4)
    expect(states.mom.valueMax).toBeCloseTo(4.4)
  })

  it('applies range padding for KST via metadata composer', () => {
    const bundle = createBundle()
    bundle.kst.series = [{ kst: -3, signal: 5 }]
    bundle.kst.params = { roc1: 10, roc2: 15, roc3: 20, roc4: 30, signalPeriod: 9, showKST: true, showSignal: true } as never
    const timestamp = 1000
    const visibleRange = { start: 0, end: 1 }

    const states = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp, { kst: true }, getComposerMetadata)

    expect(states.kst.visibleMin).toBe(-3)
    expect(states.kst.visibleMax).toBe(5)
    expect(states.kst.valueMin).toBeCloseTo(-3.8)
    expect(states.kst.valueMax).toBeCloseTo(5.8)
  })

  it('applies non-negative upper padding for ATR via metadata composer', () => {
    const bundle = createBundle()
    bundle.atr.series = [undefined, 1, 5]
    bundle.atr.params = { period: 14, showATR: true } as never
    const timestamp = 1000
    const visibleRange = { start: 1, end: 3 }

    const states = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp, { atr: true }, getComposerMetadata)

    expect(states.atr.visibleMin).toBe(1)
    expect(states.atr.visibleMax).toBe(5)
    expect(states.atr.valueMin).toBe(0)
    expect(states.atr.valueMax).toBeCloseTo(5.5)
  })

  it('combines series and signalSeries extremes for TRIX via metadata composer', () => {
    const bundle = createBundle()
    bundle.trix.series = [undefined, 1, 3]
    bundle.trix.signalSeries = [100, -2, 2]
    bundle.trix.params = { period: 15, signalPeriod: 9, showTRIX: true, showSignal: true } as never
    const timestamp = 1000
    const visibleRange = { start: 1, end: 3 }

    const states = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp, { trix: true }, getComposerMetadata)

    expect(states.trix.visibleMin).toBe(-2)
    expect(states.trix.visibleMax).toBe(3)
    expect(states.trix.valueMin).toBeCloseTo(-2.25)
    expect(states.trix.valueMax).toBeCloseTo(3.25)
    expect((states.trix as any).signalSeries).toBe(bundle.trix.signalSeries)
  })

  it('applies symmetric abs padding for MACD via metadata composer', () => {
    const bundle = createBundle()
    bundle.macd.series = [{ dif: -2, dea: 1, macd: 4 }]
    bundle.macd.params = { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, showDIF: true, showDEA: true, showBAR: true } as never
    const timestamp = 1000
    const visibleRange = { start: 0, end: 1 }

    const states = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp, { macd: true }, getComposerMetadata)

    expect(states.macd.visibleMin).toBe(-2)
    expect(states.macd.visibleMax).toBe(4)
    expect(states.macd.valueMin).toBeCloseTo(-2.4)
    expect(states.macd.valueMax).toBeCloseTo(4.4)
  })

  it('sets MACD latestValues via metadata composer', () => {
    const bundle = createBundle()
    bundle.macd.series = [{ dif: -2, dea: 1, macd: 4 }, { dif: -1, dea: 2, macd: 5 }]
    bundle.macd.params = { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, showDIF: true, showDEA: true, showBAR: true } as never
    const timestamp = 1000
    const visibleRange = { start: 0, end: 2 }

    const states = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp, { macd: true }, getComposerMetadata)

    expect(states.macd.latestValues).toEqual({ dif: -1, dea: 2, macd: 5 })
  })

  it('preserves empty MACD state when MACD is inactive via metadata composer', () => {
    const bundle = createBundle()
    bundle.macd.series = [{ dif: -2, dea: 1, macd: 4 }]
    bundle.macd.params = { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, showDIF: true, showDEA: true, showBAR: true } as never
    const timestamp = 1000
    const visibleRange = { start: 0, end: 1 }

    const states = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp, { macd: false }, getComposerMetadata)

    expect(states.macd.valueMin).toBe(-Infinity)
    expect(states.macd.valueMax).toBe(Infinity)
    expect(states.macd.series).toBe(bundle.macd.series)
    expect(states.macd.params).toBe(bundle.macd.params)
    expect(states.macd.timestamp).toBe(timestamp)
    expect(states.macd.latestValues).toBeUndefined()
  })



  it('applies maFamilyBounds padding for value-point overlay via metadata composer (sar)', () => {
    const bundle = createBundle()
    bundle.sar.series = [{ value: 5, trend: 'up' as const }, { value: 15, trend: 'up' as const }]
    bundle.sar.params = { period: 20, maxPeriod: 22, minPeriod: 2, af: 0.02, afMax: 0.2, showSAR: true } as never
    const timestamp = 1000
    const visibleRange = { start: 0, end: 2 }

    const states = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp, { sar: true }, getComposerMetadata)

    expect(states.sar.visibleMin).toBe(5)
    expect(states.sar.visibleMax).toBe(15)
    expect(states.sar.valueMin).toBeCloseTo(4.5)
    expect(states.sar.valueMax).toBeCloseTo(15.5)
  })

  it('applies maFamilyBounds padding for band overlay via metadata composer (keltner)', () => {
    const bundle = createBundle()
    bundle.keltner.series = [{ upper: 20, middle: 15, lower: 10 }]
    bundle.keltner.params = { period: 20, multiplier: 2, showKeltner: true, showMiddle: true } as never
    const timestamp = 1000
    const visibleRange = { start: 0, end: 1 }

    const states = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp, { keltner: true }, getComposerMetadata)

    expect(states.keltner.visibleMin).toBe(10)
    expect(states.keltner.visibleMax).toBe(20)
    expect(states.keltner.valueMin).toBeCloseTo(9.5)
    expect(states.keltner.valueMax).toBeCloseTo(20.5)
  })

  it('applies exact extremes for pivot overlay via metadata composer', () => {
    const bundle = createBundle()
    bundle.pivot.series = [{ pp: 100, r1: 105, r2: 110, r3: 115, s1: 95, s2: 90, s3: 85 }]
    bundle.pivot.params = { showPivot: true, showR1: true, showS1: true } as never
    const timestamp = 1000
    const visibleRange = { start: 0, end: 1 }

    const states = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp, { pivot: true }, getComposerMetadata)

    expect(states.pivot.visibleMin).toBe(85)
    expect(states.pivot.visibleMax).toBe(115)
    expect(states.pivot.valueMin).toBe(85)
    expect(states.pivot.valueMax).toBe(115)
  })

  it('uses fixed unit range for structure overlay via metadata composer', () => {
    const bundle = createBundle()
    bundle.structure.series = { swings: [], breakouts: [] }
    bundle.structure.params = { showStructure: true } as never
    const timestamp = 1000
    const visibleRange = { start: 0, end: 1 }

    const states = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp, { structure: true }, getComposerMetadata)

    expect(states.structure.valueMin).toBe(0)
    expect(states.structure.valueMax).toBe(1)
    expect(states.structure.visibleMin).toBe(0)
    expect(states.structure.visibleMax).toBe(1)
  })

  it('derives volumeProfile range from bins and val/vah via metadata composer', () => {
    const bundle = createBundle()
    bundle.volumeProfile.series = {
      bins: [{ priceLow: 95, priceHigh: 105, volume: 10, poc: false }],
      vah: 103,
      val: 97,
      poc: 100,
    }
    bundle.volumeProfile.params = { showVolumeProfile: true } as never
    const timestamp = 1000
    const visibleRange = { start: 0, end: 1 }

    const states = composeVisibleSubIndicatorStates(bundle, visibleRange, timestamp, { volumeProfile: true }, getComposerMetadata)

    expect(states.volumeProfile.valueMin).toBe(95)
    expect(states.volumeProfile.valueMax).toBe(105)
    expect(states.volumeProfile.visibleMin).toBe(97)
    expect(states.volumeProfile.visibleMax).toBe(103)
  })

  it('applies CCI clamp bounds via metadata composer', () => {
    const bundle = createBundle()
    bundle.cci.series = [-200, 100]
    bundle.cci.params = { period: 14, showCCI: true } as never
    const timestamp = 1000
    const visibleRange = { start: 0, end: 2 }

    const states = composeVisibleSubIndicatorStates(
      bundle, visibleRange, timestamp, { cci: true },
      getComposerMetadata,
    )

    expect(states.cci.visibleMin).toBe(-200)
    expect(states.cci.visibleMax).toBe(100)
    expect(states.cci.valueMin).toBe(-200)
    expect(states.cci.valueMax).toBe(150)
  })

  it('applies CCI lower clamp when extremes are within bounds', () => {
    const bundle = createBundle()
    bundle.cci.series = [-50, 30]
    bundle.cci.params = { period: 14, showCCI: true } as never
    const timestamp = 1000
    const visibleRange = { start: 0, end: 2 }

    const states = composeVisibleSubIndicatorStates(
      bundle, visibleRange, timestamp, { cci: true },
      getComposerMetadata,
    )

    expect(states.cci.visibleMin).toBe(-50)
    expect(states.cci.visibleMax).toBe(30)
    expect(states.cci.valueMin).toBe(-150)
    expect(states.cci.valueMax).toBe(150)
  })

  it('preserves empty CCI state when CCI is inactive', () => {
    const bundle = createBundle()
    bundle.cci.series = [-200, 100]
    bundle.cci.params = { period: 14, showCCI: true } as never
    const timestamp = 1000
    const visibleRange = { start: 0, end: 2 }

    const states = composeVisibleSubIndicatorStates(
      bundle, visibleRange, timestamp, { cci: false },
      getComposerMetadata,
    )

    expect(states.cci.valueMin).toBe(-150)
    expect(states.cci.valueMax).toBe(150)
    expect(states.cci.visibleMin).toBe(Infinity)
    expect(states.cci.visibleMax).toBe(-Infinity)
    expect(states.cci.series).toBe(bundle.cci.series)
    expect(states.cci.params).toBe(bundle.cci.params)
    expect(states.cci.timestamp).toBe(1000)
  })

  it('throws when registered indicator lacks visibleState.compose', () => {
    const missingCompose = (id: string) =>
      id === 'cci'
        ? { name: 'cci', displayName: 'CCI', category: 'oscillator' as const, stateKey: '', defaultPaneId: '', rendererFactory: vi.fn() as never }
        : undefined

    expect(() =>
      composeVisibleSubIndicatorStates(
        createBundle(),
        { start: 0, end: 1 },
        1000,
        {},
        missingCompose,
      ),
    ).toThrow('[StateComposer] Missing visibleState.compose for cci')
  })

  it('uses metadata path for all visible sub indicator states', () => {
    const bundle = createBundle()
    const timestamp = 1000
    const visibleRange = { start: 0, end: 1 }
    const states = composeVisibleSubIndicatorStates(
      bundle, visibleRange, timestamp, {},
      getComposerMetadata,
    )
    expect(states.cci.valueMin).toBe(-150)
    expect(states.cci.valueMax).toBe(150)
  })
})
