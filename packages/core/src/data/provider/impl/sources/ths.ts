/** 同花顺 THS Provider：注册配置集中声明于 sourceRegistry，接入逻辑由通用装配器提供。 */
import { createHttpMarketDataTransport, createMarketDataProvider } from '../../protocol/index.js'
import { marketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'

const THS = dataSourceRegistry.ths

/** V1 HTTP Transport：运行时从注册表读取 baseUrl，支持面板动态覆盖。 */
const transport = createHttpMarketDataTransport({
  baseUrl: () => marketDataProviderRegistry.getConfig('ths').baseUrl ?? THS.defaultBaseUrl,
  sourceLabel: 'ths',
})

/**
 * 同花顺 V1 Provider：访问 KCQ-THS-connector。
 *
 * 上游端外仅提供日线级行情，故连接器只声明 periods=['daily']；请求分钟级周期时
 * 连接器返回 UNSUPPORTED_CAPABILITY，由 SourceRouter 自动流转到其它数据源。
 */
export const thsMarketDataProvider = createMarketDataProvider({
  source: {
    id: THS.id,
    displayName: THS.displayName,
    description: THS.description,
    defaultBaseUrl: THS.defaultBaseUrl,
  },
  transport,
})

// 模块加载副作用：把 ths Provider 注册进全局注册表，供应用直接使用。
// 幂等保护：已注册过（如 HMR 或重复 import）则跳过，避免重复注册报错。
if (!marketDataProviderRegistry.get('ths')) {
  marketDataProviderRegistry.register(thsMarketDataProvider)
}
