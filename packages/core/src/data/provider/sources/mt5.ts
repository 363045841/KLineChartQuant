/** MT5 Provider：注册配置集中声明于 sourceRegistry，接入逻辑由通用装配器提供。 */
import { createHttpMarketDataTransport, createMarketDataProvider } from '../protocol/index.js'
import { marketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'
import { BarsLiveSource } from '../../live/barsLive.js'

const MT5 = dataSourceRegistry.mt5

/** V1 HTTP Transport：运行时从注册表读取 baseUrl，支持面板动态覆盖。 */
const transport = createHttpMarketDataTransport({
  baseUrl: () => marketDataProviderRegistry.getConfig('mt5').baseUrl ?? MT5.defaultBaseUrl,
  sourceLabel: 'mt5',
})

/** MT5 V1 Provider：访问 KCQ-MT5-connector（本机终端网关，含 SSE 实时流）。 */
export const mt5MarketDataProvider = createMarketDataProvider({
  source: {
    id: MT5.id,
    displayName: MT5.displayName,
    description: MT5.description,
    defaultBaseUrl: MT5.defaultBaseUrl,
    // 7x24 UTC 会话：bars 请求的时区解析要求 sessionId 已注册
    marketSessions: MT5.marketSessions,
  },
  transport,
  /** MT5 实时 K 线流在连接时读取运行时地址，面板改址后的下一次订阅立即生效。 */
  liveBars: {
    createStream({ symbol, period, barAggregation }) {
      const baseUrl = marketDataProviderRegistry.getConfig(MT5.id).baseUrl ?? MT5.defaultBaseUrl
      return new BarsLiveSource(MT5.id, symbol, period, barAggregation, baseUrl)
    },
  },
})

// 模块加载副作用：把 mt5 Provider 注册进全局注册表，供应用直接使用。
// 幂等保护：已注册过（如 HMR 或重复 import）则跳过，避免重复注册报错。
if (!marketDataProviderRegistry.get('mt5')) {
  marketDataProviderRegistry.register(mt5MarketDataProvider)
}
