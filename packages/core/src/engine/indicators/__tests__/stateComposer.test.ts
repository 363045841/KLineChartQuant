import { describe, expect, it, vi } from 'vitest'
import type { IndicatorMetadata } from '../indicatorMetadata'
import { computeMainIndicatorPriceRange } from '../stateComposer'
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
})
