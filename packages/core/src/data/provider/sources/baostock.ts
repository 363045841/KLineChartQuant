/** BaoStock V1 Provider：装配与注册集中于此，接入逻辑由通用装配器提供。 */
import { createHttpMarketDataTransport, createMarketDataProvider } from '../protocol'
import { marketDataProviderRegistry } from '../registry'
import { dataSourceRegistry } from '../sourceRegistry'

const BAOSTOCK = dataSourceRegistry.baostock

/** V1 HTTP Transport：运行时从注册表读取 baseUrl，支持面板动态覆盖。 */
const v1Transport = createHttpMarketDataTransport({
  baseUrl: () => marketDataProviderRegistry.getConfig('baostock').baseUrl ?? BAOSTOCK.defaultBaseUrl,
  sourceLabel: 'baostock',
})

/** BaoStock V1 Provider：通过统一行情协议访问 BaoStock 代理。 */
export const baostockMarketDataProvider = createMarketDataProvider({
  source: {
    id: BAOSTOCK.id,
    displayName: BAOSTOCK.displayName,
    description: BAOSTOCK.description,
    defaultBaseUrl: BAOSTOCK.defaultBaseUrl,
  },
  transport: v1Transport,
})

// 模块加载副作用：把 baostock Provider 注册进全局注册表，供应用直接使用。
// 幂等保护：已注册过（如 HMR 或重复 import）则跳过，避免重复注册报错。
if (!marketDataProviderRegistry.get('baostock')) {
  marketDataProviderRegistry.register(baostockMarketDataProvider)
}
