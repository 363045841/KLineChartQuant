/** GOTDX V1 Provider：后端支持 V1 契约的注册配置，接入逻辑由通用装配器提供。 */
import { createHttpMarketDataV1Transport, createV1MarketDataProvider } from './marketData/api'
import { DEFAULT_V1_BASE_URL } from './marketData/api'
import { marketDataProviderRegistry } from './marketData/providerRegistry'

/** V1 HTTP Transport：运行时从注册表读取 baseUrl，支持面板动态覆盖。 */
const transport = createHttpMarketDataV1Transport({
  baseUrl: () => marketDataProviderRegistry.getConfig('gotdx').baseUrl ?? DEFAULT_V1_BASE_URL,
  sourceLabel: 'gotdx',
})

/** GOTDX V1 Provider：通过统一 V1 协议访问行情服务。 */
export const gotdxMarketDataProvider = createV1MarketDataProvider({
  source: {
    id: 'gotdx',
    displayName: 'GOTDX',
    description: 'TDX data source via V1 local proxy',
    defaultBaseUrl: DEFAULT_V1_BASE_URL,
  },
  transport,
})

// 模块加载副作用：把 gotdx Provider 注册进全局注册表，供应用直接使用。
// 幂等保护：已注册过（如 HMR 或重复 import）则跳过，避免重复注册报错。
if (!marketDataProviderRegistry.get('gotdx')) {
  marketDataProviderRegistry.register(gotdxMarketDataProvider)
}
