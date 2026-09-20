/**
 * MarketDataProvider 测试共享夹具：按需覆盖 capabilities / probe / catalog / bars。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 *
 * 约束：项目自有类型 MarketDataProvider 用 satisfies 全量约束，缺成员在编译期暴露。
 */
import type {
  BarDataSource,
  InstrumentCatalog,
  MarketDataProvider,
  SourceCapabilities,
} from '../../types'

/** 测试默认源级能力：stock / daily / none。 */
export const DEFAULT_SOURCE_CAPABILITIES: SourceCapabilities = {
  assetClasses: ['stock'],
  bars: { periods: ['daily'], adjustments: ['none'] },
}

/** MarketDataProvider 替身入参。 */
export interface MockMarketDataProviderOptions {
  sourceId: string
  displayName?: string
  /** 源级能力，默认 DEFAULT_SOURCE_CAPABILITIES。 */
  capabilities?: SourceCapabilities
  probe?: MarketDataProvider['probe']
  search?: InstrumentCatalog['search']
  fetchBars?: BarDataSource['fetch']
}

/** 构造 MarketDataProvider 替身，只装配调用方声明的能力模块。 */
export function createMockMarketDataProvider(
  options: MockMarketDataProviderOptions,
): MarketDataProvider {
  const {
    sourceId,
    displayName = sourceId,
    capabilities = DEFAULT_SOURCE_CAPABILITIES,
    probe,
    search,
    fetchBars,
  } = options
  return {
    source: { id: sourceId, displayName, capabilities },
    probe: probe ?? (async () => ({ status: 'online', checkedAt: 1, capabilities })),
    ...(search ? { catalog: { search } } : {}),
    ...(fetchBars ? { bars: { fetch: fetchBars } } : {}),
  } satisfies MarketDataProvider
}
