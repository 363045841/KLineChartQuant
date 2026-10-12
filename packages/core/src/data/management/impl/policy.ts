/** 搜索策略与自动行情路由策略分别生效。 */
import type { MarketDataSourceConfig } from '../../provider/types.js'

/** 未显式配置搜索策略的 Provider 默认参与搜索。 */
export function participatesInSearch(config: Readonly<MarketDataSourceConfig>): boolean {
  return config.searchEnabled ?? true
}
