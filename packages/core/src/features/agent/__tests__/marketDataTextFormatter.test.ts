// 本文件验证精确品种查询结果转义为完整字段的 Markdown 表格。

import { describe, expect, it } from 'vitest'
import type { InstrumentDescriptor } from '../../../data/provider/types'
import { createMarketDataTextFormatter } from '../marketDataTextFormatter'

/** 构造带嵌套能力与路由字段的精确匹配品种。 */
function createInstrument(overrides: Partial<InstrumentDescriptor> = {}): InstrumentDescriptor {
  return {
    id: 'gotdx:stock:0:000012',
    sourceId: 'gotdx',
    symbol: '000012',
    name: '南 玻Ａ',
    assetClass: 'stock',
    exchange: 'SZ',
    sessionId: 'CN',
    currency: 'CNY',
    providerRef: { kind: 'stock', market: 0 },
    capabilities: {
      bars: { periods: ['1min', 'daily'], adjustments: ['none'] },
      timeShare: true,
      timeShareRange: { maxTradingDays: 20 },
    },
    ...overrides,
  }
}

describe('createMarketDataTextFormatter.formatInstrumentLookup', () => {
  it('renders every field with dot paths and JSON arrays preserved', () => {
    const formatter = createMarketDataTextFormatter()

    expect(
      formatter.formatInstrumentLookup({ symbol: '000012', instruments: [createInstrument()] }),
    ).toBe(
      `instrument lookup | symbol=000012 | matches=1

| id | sourceId | symbol | name | assetClass | exchange | sessionId | currency | providerRef.kind | providerRef.market | capabilities.bars.periods | capabilities.bars.adjustments | capabilities.timeShare | capabilities.timeShareRange.maxTradingDays |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gotdx:stock:0:000012 | gotdx | 000012 | 南 玻Ａ | stock | SZ | CN | CNY | stock | 0 | ["1min","daily"] | ["none"] | true | 20 |`,
    )
  })

  it('keeps one row per exact match and escapes cell separators', () => {
    const formatter = createMarketDataTextFormatter()
    const output = formatter.formatInstrumentLookup({
      symbol: '000012',
      instruments: [
        createInstrument(),
        createInstrument({
          id: 'gotdx:index:0:000012',
          name: '国债|指数\n(净值)',
          assetClass: 'index',
          exchange: 'SH',
          capabilities: {},
        }),
      ],
    })

    expect(output).toContain('matches=2')
    expect(output).toContain('| gotdx:index:0:000012 | gotdx | 000012 | 国债\\|指数 (净值) |')
  })

  it('renders the shared empty placeholder when nothing matches', () => {
    const formatter = createMarketDataTextFormatter()

    expect(formatter.formatInstrumentLookup({ symbol: '000012', instruments: [] })).toContain(
      '无可用数据',
    )
  })
})
