/**
 * Vue 品种相关测试共享数据：可搜索品种工厂与跨数据源测试目录。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */
import type { SearchableSymbol } from '../useSymbolSearch'

/** 构造可搜索品种，只声明用例关心的字段差异。 */
export function makeSearchableSymbol(
  overrides: Partial<SearchableSymbol> & Pick<SearchableSymbol, 'id'>,
): SearchableSymbol {
  return {
    sourceId: 'gotdx',
    symbol: '600519',
    name: '贵州茅台',
    assetClass: 'stock',
    exchange: 'SH',
    sessionId: 'CN',
    providerRef: { market: 1 },
    capabilities: {},
    ...overrides,
  }
}

/** 跨数据源的测试品种目录。 */
export const TEST_SYMBOLS: ReadonlyArray<SearchableSymbol> = [
  makeSearchableSymbol({ id: 'gotdx:stock:1:600519' }),
  makeSearchableSymbol({
    id: 'tradingview:stock:NASDAQ:AAPL',
    sourceId: 'tradingview',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    exchange: 'NASDAQ',
    sessionId: 'US',
    providerRef: undefined,
  }),
]
