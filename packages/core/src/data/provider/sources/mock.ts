/** 统一 MOCK Provider：本地生成数据、不依赖后端，探测恒为在线。 */
import { fetchMock, searchMockInstruments } from '../../legacy/mock'
import { marketDataProviderRegistry } from '../registry'
import { dataSourceRegistry } from '../sourceRegistry'
import type { MarketDataProvider } from '../types'

const MOCK_SOURCE = dataSourceRegistry.mock

/** 统一行情模型下的本地 MOCK Provider，不依赖 HTTP 后端。 */
export const mockMarketDataProvider: MarketDataProvider = {
  source: {
    id: MOCK_SOURCE.id,
    displayName: MOCK_SOURCE.displayName,
    description: MOCK_SOURCE.description,
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
    /** 复用旧 MOCK 生成器拉取日 K 数据。 */
    async fetch(query) {
      const data = await fetchMock('mock', {
        symbol: query.instrument.symbol,
        startDate: new Date(query.from).toISOString().slice(0, 10),
        endDate: new Date(query.to).toISOString().slice(0, 10),
        period: query.period,
        adjust: query.adjustment,
        exchange: query.instrument.exchange,
        params: query.instrument.providerRef,
      })
      return {
        instrumentId: query.instrument.id,
        period: query.period,
        adjustment: query.adjustment,
        timezone: 'Asia/Shanghai',
        volumeUnit: 'share',
        data,
      }
    },
  },
}

if (!marketDataProviderRegistry.get('mock')) {
  marketDataProviderRegistry.register(mockMarketDataProvider)
}
