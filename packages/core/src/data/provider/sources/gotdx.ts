/** GOTDX Provider：注册配置集中声明于 sourceRegistry，接入逻辑由通用装配器提供。 */
import { createHttpMarketDataTransport, createMarketDataProvider } from '../protocol'
import { marketDataProviderRegistry } from '../registry'
import { dataSourceRegistry } from '../sourceRegistry'

const GOTDX = dataSourceRegistry.gotdx

/** V1 HTTP Transport：运行时从注册表读取 baseUrl，支持面板动态覆盖。 */
const transport = createHttpMarketDataTransport({
  baseUrl: () => marketDataProviderRegistry.getConfig('gotdx').baseUrl ?? GOTDX.defaultBaseUrl,
  sourceLabel: 'gotdx',
})

/** GOTDX V1 Provider：通过统一行情协议访问行情服务。 */
export const gotdxMarketDataProvider = createMarketDataProvider({
  source: {
    id: GOTDX.id,
    displayName: GOTDX.displayName,
    description: GOTDX.description,
    defaultBaseUrl: GOTDX.defaultBaseUrl,
  },
  transport,
})

// 模块加载副作用：把 gotdx Provider 注册进全局注册表，供应用直接使用。
// 幂等保护：已注册过（如 HMR 或重复 import）则跳过，避免重复注册报错。
if (!marketDataProviderRegistry.get('gotdx')) {
  marketDataProviderRegistry.register(gotdxMarketDataProvider)
}
