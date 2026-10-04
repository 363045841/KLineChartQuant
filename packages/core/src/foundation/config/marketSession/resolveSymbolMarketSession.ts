/** 按品种的市场标识解析交易时段配置；只依赖最小字段，不耦合上层品种契约。 */
import type { MarketSessionConfig } from '../../utils/sessionTimeLabels.js'
import type { MarketSessionRegistry } from './marketSessionRegistry.js'

/** 解析所需的最小品种形状：市场标识 + 可选展示代码。 */
export interface MarketSessionRef {
  market?: string
  symbol?: string
}

/**
 * 按品种的市场标识查询交易时段配置。
 *
 * @param spec - 携带 market 标识的品种引用；缺 market 时抛错
 * @param registry - 市场会话注册表
 * @returns 该市场对应的交易时段配置
 */
export function resolveSymbolMarketSession(
  spec: MarketSessionRef,
  registry: MarketSessionRegistry,
): MarketSessionConfig {
  const market = spec.market?.trim()
  if (!market) throw new Error(`SymbolSpec.market is required for ${spec.symbol}`)
  return registry.getRequired(market)
}
