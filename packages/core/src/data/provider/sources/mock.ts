/** 统一 MOCK Provider：本地生成数据、不依赖后端，探测恒为在线。 */
import { marketDataProviderRegistry } from '../registry'
import { dataSourceRegistry } from '../sourceRegistry'
import type { MarketDataProvider } from '../types'
import { fetchMockBars, searchMockInstruments } from './mockData'

const MOCK_SOURCE = dataSourceRegistry.mock

/** 统一行情模型下的本地 MOCK Provider，不依赖 HTTP 后端。 */
export const mockMarketDataProvider: MarketDataProvider = {
  source: {
    id: MOCK_SOURCE.id,
    displayName: MOCK_SOURCE.displayName,
    description: MOCK_SOURCE.description,
    capabilities: {
      assetClasses: ['index'],
      bars: { periods: ['daily'], adjustments: ['none'] },
    },
  },

  /** 本地生成数据始终可用，因此探测恒为在线。 */
  async probe() {
    return { status: 'online', checkedAt: Date.now(), latencyMs: 0 }
  },

  catalog: {
    /** 搜索本地 MOCK 品种目录。 */
    async search(query) {
      return searchMockInstruments(query.keyword, query.limit)
    },
  },

  bars: {
    /** 使用 Provider 原生请求生成日 K 数据。 */
    async fetch(query) {
      const data = fetchMockBars(query)
      return {
        instrumentId: query.instrument.id,
        period: query.period,
        adjustment: query.adjustment,
        timezone: 'Asia/Shanghai',
        volumeUnit: 'share',
        olderData: 'unknown',
        data,
      }
    },
  },
}

if (!marketDataProviderRegistry.get('mock')) {
  marketDataProviderRegistry.register(mockMarketDataProvider)
}
