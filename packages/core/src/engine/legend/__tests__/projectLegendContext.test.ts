import { describe, expect, it } from 'vitest'
import type { SymbolSpec } from '@/controllers/types'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'
import { createTimeSharePoint } from '@/engine/__tests__/helpers/timeShareTestKit'
import { projectComparison } from '@/engine/chartModel'
import { symbolSpecIdentityKey } from '@/engine/data/symbolIdentity'
import { LEGEND_GAP_PX, LEGEND_READOUT_GAP_PX } from '@/engine/legend/impl/legendGeometry'
import { PANE_HEADER_INSET_PX } from '@/engine/pane/types'
import { ChartDataViewId } from '@/foundation/types/chartView'
import type { KLineData, TimeShareData } from '@/foundation/types/price'
import { projectLegendContext } from '../impl/projectLegendContext'
import { projectMainLegendRows } from '../impl/projectLegendRows'

function point(timestamp: number, price: number): TimeShareData {
  return createTimeSharePoint({
    timestamp,
    price,
    average: price,
    volume: 100,
    amount: price * 100,
  })
}

/** 分时图例上下文只声明数据、基准与十字线索引，其余字段共用默认值。 */
function createTimeshareLegendContext(options: {
  data: TimeShareData[]
  baseline?: number
  crosshairIndex?: number
}): ReturnType<typeof createMockRenderContext> {
  return createMockRenderContext({
    data: options.data,
    period: 'timeshare',
    dataView: ChartDataViewId.TimeShare,
    range: { start: 0, end: options.data.length },
    crosshairIndex: options.crosshairIndex ?? 0,
    paneWidth: 800,
    isAsiaMarket: true,
    timeShareBaseline: options.baseline,
  })
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
  it('formats volume with the shared quantity text', () => {
    const timeshare = createTimeshareLegendContext({
      data: [{ ...point(1, 10), volume: 12_345 }],
      baseline: 9,
    })
    const kline = createMockRenderContext({
      data: [{ timestamp: 1, open: 10, high: 11, low: 9, close: 10, volume: 12_345 }],
      period: 'daily',
      dataView: ChartDataViewId.KLine,
      range: { start: 0, end: 1 },
      crosshairIndex: 0,
      paneWidth: 800,
      isAsiaMarket: true,
    })

    const timeshareRow = projectLegendContext({ context: timeshare, host: null })?.timeshare
    const klineRow = projectLegendContext({ context: kline, host: null })?.currentBar

    expect(timeshareRow?.volumeText).toBe('1.23万')
    expect(klineRow?.volumeText).toBe(timeshareRow?.volumeText)
  })

  // 验证仅有成交额的分时不伪造成交量。
  it('keeps amount-only timeshare metrics separate from volume', () => {
    const context = createTimeshareLegendContext({
      data: [
        createTimeSharePoint({
          timestamp: 1,
          price: 3812.11,
          average: 3812.11,
          amount: 6_972_838_100,
        }),
      ],
      baseline: 3828.47,
    })

    const result = projectLegendContext({ context, host: null })

    expect(result?.timeshare?.volume).toBeNull()
    expect(result?.timeshare?.volumeText).toBeNull()
    expect(result?.timeshare?.amount).toBe(6_972_838_100)
    expect(result?.timeshare?.amountText).toBe('69.73亿')
  })

  it.each([undefined, -1])('keeps the quote when the baseline is %s', (preClose) => {
    const context = createTimeshareLegendContext({
      data: [point(1, 10), point(2, 11)],
      baseline: preClose,
      crosshairIndex: 1,
    })

    const result = projectLegendContext({ context, host: null })

    expect(result?.timeshare?.change).toBeNull()
    expect(result?.timeshare?.price).toBe(11)
    expect(result?.timeshare?.average).toBe(11)

    const rows = projectMainLegendRows(result!, 0)
    expect(rows.flatMap((row) => row.texts.map((text) => text.text))).toEqual([
      '现价 11.00',
      '均价 11.00',
      '成交量 100.00',
      '成交额 1100.00',
    ])
    expect(rows[0]!.texts[0]!.color).toBe(result?.colors?.textPrimary)
  })
})

describe('projectLegendContext shared change readout', () => {
  it('分时与 K 线输出同一份涨跌读数与文本', () => {
    const timeshare = projectLegendContext({
      context: createTimeshareLegendContext({ data: [point(1, 10)], baseline: 9 }),
      host: null,
    })!
    const kline = projectLegendContext({
      context: createMockRenderContext({
        data: [
          { timestamp: 1000, open: 9, high: 9, low: 9, close: 9 },
          { timestamp: 2000, open: 9, high: 10, low: 9, close: 10 },
        ],
        period: 'daily',
        dataView: ChartDataViewId.KLine,
        range: { start: 0, end: 2 },
        crosshairIndex: 1,
        paneWidth: 800,
        isAsiaMarket: true,
      }),
      host: null,
    })!

    // 涨跌文本片段：只在 K 线与分时各自行里取带符号/括号的读数。
    const changeTexts = (legend: NonNullable<ReturnType<typeof projectLegendContext>>) =>
      projectMainLegendRows(legend, 0)
        .flatMap((row) => row.texts.map((text) => text.text))
        .filter((text) => /^[(+-]/.test(text))

    expect(timeshare.timeshare?.change?.amount).toBe(1)
    expect(timeshare.timeshare?.change?.percent).toBeCloseTo(100 / 9)
    expect(timeshare.timeshare?.change?.color).toBe(timeshare.colors.up)
    expect(changeTexts(timeshare)).toEqual(['+1.00', '(+11.11%)'])
    expect(changeTexts(kline)).toEqual(changeTexts(timeshare))

    const gapsOf = (legend: NonNullable<ReturnType<typeof projectLegendContext>>, key: string) =>
      projectMainLegendRows(legend, 0)
        .find((row) => row.key === key)!
        .texts.map((text) => text.gapBefore)
    // 首段为 0，默认间距取行 gap，涨跌组内部只空 1/4 格。
    expect(gapsOf(timeshare, 'timeshare')).toEqual([
      0,
      LEGEND_GAP_PX,
      LEGEND_GAP_PX,
      LEGEND_READOUT_GAP_PX,
      LEGEND_GAP_PX,
      LEGEND_GAP_PX,
    ])
    expect(gapsOf(kline, 'bar')).toEqual([
      0,
      LEGEND_GAP_PX,
      LEGEND_GAP_PX,
      LEGEND_GAP_PX,
      LEGEND_GAP_PX,
      LEGEND_READOUT_GAP_PX,
    ])
  })
})

describe('projectLegendContext bar change', () => {
  const bars: KLineData[] = [
    { timestamp: 1000, open: 10, high: 11, low: 9, close: 10 },
    { timestamp: 2000, open: 10, high: 13, low: 8, close: 9 },
  ]

  it.each([
    { close: 12, expectedAmount: 2, expectedPercent: 20, colorKey: 'up' as const },
    { close: 8, expectedAmount: -2, expectedPercent: -20, colorKey: 'down' as const },
  ])(
    '以光标所指 K 线的前一根收盘价为基准计算涨跌 (close=$close)',
    ({ close, expectedAmount, expectedPercent, colorKey }) => {
      const context = createMockRenderContext({
        data: [bars[0]!, { ...bars[1]!, close }],
        crosshairIndex: 1,
        range: { start: 0, end: 2 },
      })

      const result = projectLegendContext({ context, host: null })

      expect(result?.currentBar?.change?.amount).toBe(expectedAmount)
      expect(result?.currentBar?.change?.percent).toBeCloseTo(expectedPercent)
      expect(result?.currentBar?.change?.color).toBe(result?.colors[colorKey])
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
          instrumentType: 'stock',
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
