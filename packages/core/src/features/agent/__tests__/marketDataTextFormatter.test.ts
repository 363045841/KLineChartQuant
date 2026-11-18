// 本文件验证行情查询结果转成 Agent 文本后的标题、列与时区写法。

import { describe, expect, it } from 'vitest'
import type {
  BarSeries,
  InstrumentDescriptor,
  TimeShareDay,
} from '@/data/provider/types'
import type { BarsQueryResult, TimeShareDaysResult } from '../types'
import { createMarketDataTextFormatter } from '../impl/marketDataTextFormatter'

const TIMEZONE = 'Asia/Shanghai'
const DAILY_BAR = Date.parse('2026-11-18T00:00:00+08:00')
const MINUTE_BAR = Date.parse('2026-11-18T09:31:00+08:00')

/** 构造品种描述；用例只声明差异字段。 */
function instrument(overrides: Partial<InstrumentDescriptor> = {}): InstrumentDescriptor {
  return {
    id: 'tdx:stock:600519',
    sourceId: 'tdx',
    symbol: '600519',
    name: '贵州茅台',
    instrumentType: 'stock',
    exchange: 'SSE',
    capabilities: { bars: { periods: ['daily'], adjustments: ['none'] } },
    ...overrides,
  }
}

/** 构造 K 线序列；默认一根日线。 */
function barSeries(overrides: Partial<BarSeries> = {}): BarSeries {
  return {
    instrumentId: 'tdx:stock:600519',
    period: 'daily',
    adjustment: 'none',
    barAggregation: 'original',
    timezone: TIMEZONE,
    olderData: 'available',
    data: [{ timestamp: DAILY_BAR, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }],
    ...overrides,
  }
}

/** 构造分时结果；默认单日两天点。 */
function timeShareResult(overrides: Partial<TimeShareDaysResult> = {}): TimeShareDaysResult {
  const day: TimeShareDay = {
    tradingDate: '2026-11-18',
    preClose: 1680.5,
    data: [
      { timestamp: MINUTE_BAR, price: 1681, average: 1680.8, volume: 10 },
      { timestamp: MINUTE_BAR + 60_000, price: 1682, average: 1680.9, volume: 12 },
    ],
  }
  return {
    sourceId: 'tdx',
    instrument: instrument(),
    timezone: TIMEZONE,
    requestedDate: null,
    resolvedDate: '2026-11-18',
    days: [day],
    ...overrides,
  }
}

describe('formatInstrumentLookup', () => {
  const formatter = createMarketDataTextFormatter()

  it('只输出固定列并统计精确与关键字命中', () => {
    const output = formatter.formatInstrumentLookup({
      query: '600519',
      matches: [
        { instrument: instrument(), exact: true },
        { instrument: instrument({ id: 'tdx:index:600519', instrumentType: 'index' }), exact: false },
      ],
    })

    expect(output).toBe(
      [
        'instrument matches | query=600519 | exact=1 | fuzzy=1',
        '',
        '| sourceId | symbol | name | exchange | instrumentType |',
        '| --- | --- | --- | --- | --- |',
        '| tdx | 600519 | 贵州茅台 | SSE | stock |',
        '| tdx | 600519 | 贵州茅台 | SSE | index |',
      ].join('\n'),
    )
  })

  it('转义单元格里的分隔符与换行', () => {
    const output = formatter.formatInstrumentLookup({
      query: '茅台',
      matches: [{ instrument: instrument({ name: '贵州|茅台\n(白酒)' }), exact: false }],
    })

    expect(output).toContain('| tdx | 600519 | 贵州\\|茅台 (白酒) | SSE | stock |')
  })
})

describe('formatBars', () => {
  const formatter = createMarketDataTextFormatter()

  /** 标题、表头与数据行三段构成一段文本；用例只断言差异部分。 */
  function render(overrides: Partial<BarsQueryResult> = {}): string {
    return formatter.formatBars({
      sourceId: 'tdx',
      instrument: instrument(),
      series: barSeries(),
      requested: 200,
      truncated: false,
      ...overrides,
    })
  }

  it.each([
    {
      name: '日线用日期列',
      series: barSeries(),
      expected: '| 2026-11-18 | 1 | 2 | 0.5 | 1.5 | 100 |',
    },
    {
      name: '日内用带偏移的 RFC 3339 列',
      series: barSeries({
        period: '1min',
        data: [{ timestamp: MINUTE_BAR, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }],
      }),
      expected: '| 2026-11-18T09:31:00+08:00 | 1 | 2 | 0.5 | 1.5 | 100 |',
    },
  ])('$name', ({ series, expected }) => {
    expect(render({ series })).toContain(expected)
  })

  it('标题回显返回量、上限与截断', () => {
    expect(render({ requested: 60, truncated: true })).toContain(
      'returned=1 | requested=60 | truncated=true | olderData=available',
    )
  })
})

describe('formatTimeShareDays', () => {
  const formatter = createMarketDataTextFormatter()

  it('按交易日分段并保留每天自己的昨收', () => {
    const output = formatter.formatTimeShareDays(timeShareResult())

    expect(output).toContain('tradingDate=2026-11-18 | days=1')
    expect(output).toContain('## 2026-11-18 | preClose=1680.5')
    expect(output).toContain('| 09:31 | 1681 | 1680.8 | 10 |')
  })

  it('请求日期被解析成别的交易日时显式回显', () => {
    const output = formatter.formatTimeShareDays(
      timeShareResult({ requestedDate: '2026-11-15' }),
    )

    expect(output).toContain('tradingDate=2026-11-18 (requested 2026-11-15, resolved)')
  })
})
