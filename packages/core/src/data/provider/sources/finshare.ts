/** FinShare V1 Provider：通过 Baostock-Connecter 提供国内期货行情。 */

import { createHttpMarketDataV1Transport, createV1MarketDataProvider } from '../protocol'
import { marketDataProviderRegistry } from '../registry'
import { dataSourceRegistry } from '../sourceRegistry'

const FINSHARE = dataSourceRegistry.finshare

/** V1 HTTP Transport：运行时从注册表读取 baseUrl，支持面板动态覆盖。 */
const v1Transport = createHttpMarketDataV1Transport({
  baseUrl: () =>
    marketDataProviderRegistry.getConfig('finshare').baseUrl ?? FINSHARE.defaultBaseUrl,
  sourceLabel: 'finshare',
})

/** FinShare V1 Provider：统一搜索和请求国内期货日线。 */
export const finshareMarketDataProvider = createV1MarketDataProvider({
  source: {
    id: FINSHARE.id,
    displayName: FINSHARE.displayName,
    description: FINSHARE.description,
    defaultBaseUrl: FINSHARE.defaultBaseUrl,
  },
  transport: v1Transport,
})

// 模块加载副作用：注册 finshare Provider，供聚合搜索与 SourceRouter 使用。
if (!marketDataProviderRegistry.get('finshare')) {
  marketDataProviderRegistry.register(finshareMarketDataProvider)
}
