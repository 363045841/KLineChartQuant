/** 单 symbol 成交流地址：市场由 providerRef 原样回传，客户端不解析也不补默认值。 */
import { describe, expect, it } from 'vitest'
import { V1_ENDPOINTS } from '../../provider/protocol/types.js'
import type { InstrumentDescriptor, ProviderRef } from '../../provider/types.js'
import { buildTradeStreamUrl } from '../impl/tradeSource.js'

const BASE_URL = 'http://127.0.0.1:8091'

/** 构造最小品种描述，用例只声明与地址构造有关的差异。 */
function instrument(providerRef?: ProviderRef): InstrumentDescriptor {
  return {
    id: 'binance:spot:BTCUSDT',
    sourceId: 'binance',
    symbol: 'BTCUSDT',
    name: 'BTCUSDT',
    instrumentType: 'crypto',
    exchange: 'BINANCE',
    capabilities: {},
    ...(providerRef ? { providerRef } : {}),
  }
}

describe('buildTradeStreamUrl', () => {
  const marketCases: ReadonlyArray<readonly [string, string]> = [
    ['perp', 'market=perp'],
    ['spot', 'market=spot'],
  ]

  it.each(marketCases)('把 providerRef.market=%s 原样带进单 symbol 流', (market, expected) => {
    expect(buildTradeStreamUrl(BASE_URL, 'binance', instrument({ market }))).toBe(
      `${BASE_URL}${V1_ENDPOINTS.sources}/binance/trades/stream?symbol=BTCUSDT&kind=aggregated&${expected}`,
    )
  })

  const noMarketCases: ReadonlyArray<readonly [string, ProviderRef | undefined]> = [
    ['缺 providerRef', undefined],
    ['providerRef 无 market', { symbol: 'BTCUSDT' }],
    ['market 不是字符串', { market: 1 }],
    ['market 是空白', { market: '   ' }],
  ]

  it.each(noMarketCases)('%s 时不写 market 参数', (_label, providerRef) => {
    expect(buildTradeStreamUrl(BASE_URL, 'binance', instrument(providerRef))).toBe(
      `${BASE_URL}${V1_ENDPOINTS.sources}/binance/trades/stream?symbol=BTCUSDT&kind=aggregated`,
    )
  })

  it('对 sourceId 做路径编码，避免拼接出第二个路径段', () => {
    expect(buildTradeStreamUrl(BASE_URL, 'binance spot', instrument())).toBe(
      `${BASE_URL}${V1_ENDPOINTS.sources}/binance%20spot/trades/stream?symbol=BTCUSDT&kind=aggregated`,
    )
  })
})
