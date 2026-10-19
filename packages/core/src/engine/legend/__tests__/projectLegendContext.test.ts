import { describe, expect, it } from 'vitest'
import type { SymbolSpec } from '@/controllers/types'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'
import { projectComparison } from '@/engine/chartModel'
import { symbolSpecIdentityKey } from '@/engine/data/symbolIdentity'
import { PANE_HEADER_INSET_PX } from '@/engine/pane/types'
import { ChartDataViewId } from '@/foundation/types/chartView'
import type { KLineData, TimeShareData } from '@/foundation/types/price'
import { projectLegendContext } from '../impl/projectLegendContext'

function point(timestamp: number, price: number): TimeShareData {
  return { timestamp, price, average: price, volume: 100, amount: price * 100 }
}

describe('projectLegendContext layout', () => {
  it('主图图例左、上内边距一致', () => {
    const context = createMockRenderContext({
      data: [{ timestamp: 1, open: 10, high: 11, low: 9, close: 10 }],
      period: 'daily',
      dataView: 'kline',
      range: { start: 0, end: 1 },
      paneWidth: 800,
      isAsiaMarket: true,
    })

    const layout = projectLegendContext({ context, host: null })!.layout

    expect(layout.x).toBe(PANE_HEADER_INSET_PX)
    expect(layout.y).toBe(PANE_HEADER_INSET_PX)
  })
})

describe('projectLegendContext timeshare baseline', () => {
  it('formats timeshare volume as hands', () => {
    const context = createMockRenderContext({
      data: [{ ...point(1, 10), volume: 12_345 }],
      period: 'timeshare',
      dataView: ChartDataViewId.TimeShare,
      range: { start: 0, end: 1 },
      crosshairIndex: 0,
      paneWidth: 800,
      isAsiaMarket: true,
      settings: { preClose: 9 },
    })

    const result = projectLegendContext({ context, host: null })

    expect(result?.timeshare?.volumeText).toBe('1.23万手')
  })

  // 验证仅有成交额的分时不伪造成交量。
  it('keeps amount-only timeshare metrics separate from volume', () => {
    const context = createMockRenderContext({
      data: [{ timestamp: 1, price: 3812.11, average: 3812.11, amount: 6_972_838_100 }],
      period: 'timeshare',
      dataView: ChartDataViewId.TimeShare,
      range: { start: 0, end: 1 },
      crosshairIndex: 0,
      paneWidth: 800,
      isAsiaMarket: true,
      settings: { preClose: 3828.47 },
    })

    const result = projectLegendContext({ context, host: null })

    expect(result?.timeshare?.volume).toBeNull()
    expect(result?.timeshare?.volumeText).toBeNull()
    expect(result?.timeshare?.amount).toBe(6_972_838_100)
    expect(result?.timeshare?.amountText).toBe('69.73亿')
  })

  it.each([undefined, -1])(
    'does not derive changes from the first price when preClose is %s',
    (preClose) => {
      const context = createMockRenderContext({
        data: [point(1, 10), point(2, 11)],
        period: 'timeshare',
        dataView: ChartDataViewId.TimeShare,
        range: { start: 0, end: 2 },
        crosshairIndex: 1,
        paneWidth: 800,
        isAsiaMarket: true,
        settings: { preClose },
      })

      const result = projectLegendContext({ context, host: null })

      expect(result?.timeshare).toBeNull()
    },
  )
})

describe('projectLegendContext comparison rows', () => {
  const mainData: KLineData[] = [
    { timestamp: 1000, date: '2025-01-01', open: 10, high: 11, low: 9, close: 10 },
    { timestamp: 2000, date: '2025-01-02', open: 10, high: 12, low: 10, close: 11 },
  ]

  function comparisonDataFor(spec: SymbolSpec): KLineData[] {
    const base = spec.symbol === 'COMP.A' ? 20 : 30
    return [
      {
        timestamp: 1000,
        date: '2025-01-01',
        open: base,
        high: base + 1,
        low: base - 1,
        close: base,
      },
      {
        timestamp: 2000,
        date: '2025-01-02',
        open: base,
        high: base + 2,
        low: base,
        close: base + 2,
      },
    ]
  }

  const comparisonCases: ReadonlyArray<{
    spec: SymbolSpec
    label: string
    expectedPercent: number
  }> = [
    {
      spec: {
        id: 'SH.600000',
        symbol: '600000',
        market: 'SH',
        period: 'daily',
        instrument: {
          id: 'SH.600000',
          sourceId: 'test',
          symbol: '600000',
          name: '浦发银行',
          assetClass: 'stock',
          exchange: 'SH',
          capabilities: {},
        },
      },
      label: 'with id',
      expectedPercent: 100 / 15,
    },
    {
      spec: { symbol: 'COMP.A', market: 'CN', period: 'daily' },
      label: 'without id',
      expectedPercent: 10,
    },
  ]

  it.each(comparisonCases)(
    'resolves comparison data by identity key ($label)',
    ({ spec, expectedPercent }) => {
      const identity = symbolSpecIdentityKey(spec)
      const comparisonData = new Map([[identity, comparisonDataFor(spec)]])
      const context = createMockRenderContext({
        data: mainData,
        period: 'daily',
        dataView: 'kline',
        range: { start: 0, end: 2 },
        crosshairIndex: 1,
        paneWidth: 800,
        isAsiaMarket: true,
        comparisonSymbols: [spec],
        comparisonData,
        comparisonProjection:
          projectComparison(mainData, comparisonData, { start: 0, end: 2 }, [0, 10], 0, 800) ??
          undefined,
        comparisonColors: new Map([[identity, '#123456']]),
      })

      const result = projectLegendContext({ context, host: null })

      expect(result?.currentBar?.close).toBe(mainData[1]!.close)
      expect(result?.comparisons).toEqual([
        {
          symbol: spec.symbol,
          identity,
          hidden: false,
          price: comparisonDataFor(spec)[1]!.close,
          bar: comparisonDataFor(spec)[1],
          ...(spec.instrument?.name ? { name: spec.instrument.name } : {}),
          percent: expectedPercent,
          color: '#123456',
          percentColor: result?.colors?.up,
        },
      ])
    },
  )

  it('keeps the primary OHLC row when comparison data is not loaded', () => {
    const spec: SymbolSpec = { id: 'SH.600000', symbol: '600000', market: 'SH', period: 'daily' }
    const context = createMockRenderContext({
      data: mainData,
      period: 'daily',
      range: { start: 0, end: 2 },
      paneWidth: 800,
      isAsiaMarket: true,
      comparisonSymbols: [spec],
      comparisonData: new Map([[symbolSpecIdentityKey(spec), []]]),
      comparisonColors: new Map([[symbolSpecIdentityKey(spec), '#123456']]),
    })

    const result = projectLegendContext({ context, host: null })

    expect(result?.comparisons).toEqual([
      expect.objectContaining({ symbol: spec.symbol, identity: symbolSpecIdentityKey(spec) }),
    ])
    expect(result?.currentBar?.close).toBe(mainData[1]!.close)
  })
})
