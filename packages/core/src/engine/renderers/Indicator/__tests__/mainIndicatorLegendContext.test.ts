import { describe, expect, it } from 'vitest'

import type { RenderContext } from '../../../../foundation/plugin'
import type { SymbolSpec } from '../../../../controllers/types'
import type { KLineData, TimeShareData } from '../../../../foundation/types/price'
import { ChartDataViewId } from '../../../../foundation/types/chartView'
import { symbolSpecIdentityKey } from '../../../data/symbolIdentity'
import { buildLegendTemplateContext } from '../mainIndicatorLegendContext'

function point(timestamp: number, price: number): TimeShareData {
  return { timestamp, price, average: price, volume: 100, amount: price * 100 }
}

describe('buildLegendTemplateContext timeshare baseline', () => {
  it('formats timeshare volume as hands', () => {
    const context = {
      data: [{ ...point(1, 10), volume: 12_345 }],
      period: 'timeshare',
      dataView: ChartDataViewId.TimeShare,
      range: { start: 0, end: 1 },
      crosshairIndex: 0,
      paneWidth: 800,
      theme: 'light',
      isAsiaMarket: true,
      settings: { preClose: 9 },
    } as unknown as RenderContext

    const result = buildLegendTemplateContext({ context, host: null, yPaddingPx: 0 })

    expect(result?.timeshare?.volumeText).toBe('1.23万手')
  })

  // 验证仅有成交额的分时不伪造成交量。
  it('keeps amount-only timeshare metrics separate from volume', () => {
    const context = {
      data: [{ timestamp: 1, price: 3812.11, average: 3812.11, amount: 6_972_838_100 }],
      period: 'timeshare',
      dataView: ChartDataViewId.TimeShare,
      range: { start: 0, end: 1 },
      crosshairIndex: 0,
      paneWidth: 800,
      theme: 'light',
      isAsiaMarket: true,
      settings: { preClose: 3828.47 },
    } as unknown as RenderContext

    const result = buildLegendTemplateContext({ context, host: null, yPaddingPx: 0 })

    expect(result?.timeshare?.volume).toBeNull()
    expect(result?.timeshare?.volumeText).toBeNull()
    expect(result?.timeshare?.amount).toBe(6_972_838_100)
    expect(result?.timeshare?.amountText).toBe('69.73亿')
  })

  it.each([undefined, -1])(
    'does not derive changes from the first price when preClose is %s',
    (preClose) => {
      const context = {
        data: [point(1, 10), point(2, 11)],
        period: 'timeshare',
        dataView: ChartDataViewId.TimeShare,
        range: { start: 0, end: 2 },
        crosshairIndex: 1,
        paneWidth: 800,
        theme: 'light',
        isAsiaMarket: true,
        settings: { preClose },
      } as unknown as RenderContext

      const result = buildLegendTemplateContext({ context, host: null, yPaddingPx: 0 })

      expect(result?.timeshare).toBeNull()
    },
  )
})

describe('buildLegendTemplateContext indicator rows', () => {
  it('uses the view-projected indicator IDs instead of evaluating view support while drawing', () => {
    const scheduler = {
      getMainIndicators: () => [
        {
          name: 'ma',
          getTitleInfo: () => ({ name: 'MA', values: [] }),
        },
        {
          name: 'boll',
          getTitleInfo: () => ({ name: 'BOLL', values: [] }),
        },
      ],
      isMainIndicatorActive: () => true,
      getMainIndicatorParams: () => ({}),
    }
    const context = {
      data: [{ timestamp: 1, open: 10, high: 11, low: 9, close: 10 }],
      period: 'timeshare',
      dataView: ChartDataViewId.TimeShare,
      range: { start: 0, end: 1 },
      paneWidth: 800,
      theme: 'light',
      isAsiaMarket: true,
      indicatorStateReader: {},
    } as unknown as RenderContext
    const host = {
      getService: () => scheduler,
    }

    const result = buildLegendTemplateContext({
      context,
      host: host as never,
      yPaddingPx: 0,
      visibleIndicatorIds: new Set(['ma']),
    })

    expect(result?.indicators).toEqual([{ name: 'MA', values: [] }])
  })
})

describe('buildLegendTemplateContext comparison rows', () => {
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

  it.each([
    {
      spec: {
        id: 'SH.600000',
        symbol: '600000',
        market: 'SH',
        period: 'daily',
        instrument: { name: '浦发银行' },
      } as SymbolSpec,
      label: 'with id',
      expectedPercent: 100 / 15,
    },
    {
      spec: { symbol: 'COMP.A', market: 'CN', period: 'daily' },
      label: 'without id',
      expectedPercent: 10,
    },
  ])('resolves comparison data by identity key ($label)', ({ spec, expectedPercent }) => {
    const identity = symbolSpecIdentityKey(spec)
    const context = {
      data: mainData,
      period: 'daily',
      dataView: 'comparison',
      range: { start: 0, end: 2 },
      crosshairIndex: 1,
      paneWidth: 800,
      theme: 'light',
      isAsiaMarket: true,
      comparisonSymbols: [spec],
      comparisonData: new Map([[identity, comparisonDataFor(spec)]]),
      comparisonColors: new Map([[identity, '#123456']]),
    } as unknown as RenderContext

    const result = buildLegendTemplateContext({ context, host: null, yPaddingPx: 0 })

    expect(result?.currentBar).toBeNull()
    // 对比视图没有主品种行，仅列出比较品种
    expect(result?.comparisons).toEqual([
      {
        symbol: spec.symbol,
        ...(spec.instrument?.name ? { name: spec.instrument.name } : {}),
        percent: expectedPercent,
        color: '#123456',
        percentColor: result?.colors?.up,
      },
    ])
  })

  it('has no main symbol row when comparison data is not loaded', () => {
    const spec: SymbolSpec = { id: 'SH.600000', symbol: '600000', market: 'SH', period: 'daily' }
    const context = {
      data: mainData,
      period: 'daily',
      range: { start: 0, end: 2 },
      paneWidth: 800,
      theme: 'light',
      isAsiaMarket: true,
      comparisonSymbols: [spec],
      comparisonData: new Map([[symbolSpecIdentityKey(spec), []]]),
      comparisonColors: new Map([[symbolSpecIdentityKey(spec), '#123456']]),
    } as unknown as RenderContext

    const result = buildLegendTemplateContext({ context, host: null, yPaddingPx: 0 })

    expect(result?.comparisons).toEqual([])
  })
})
