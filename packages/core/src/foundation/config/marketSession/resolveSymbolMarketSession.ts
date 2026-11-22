/** 按品种的会话/交易所标识解析交易时段配置；只依赖最小字段，不耦合上层品种契约。 */
import type { MarketSessionConfig } from '../../utils/sessionTimeLabels.js'
import type { MarketSessionRegistry } from './marketSessionRegistry.js'

/** 解析所需的最小品种形状：会话标识优先，回退交易所与展示代码。 */
export interface MarketSessionRef {
  sessionId?: string
  exchange?: string
  symbol?: string
}

/**
 * 按品种的市场标识查询交易时段配置。
 *
 * @param ref - 携带 sessionId/exchange 的品种引用；两者都缺时抛错
 * @param registry - 市场会话注册表
 * @returns 该市场对应的交易时段配置
 */
export function resolveSymbolMarketSession(
  ref: MarketSessionRef,
  registry: MarketSessionRegistry,
): MarketSessionConfig {
  const market = (ref.sessionId ?? ref.exchange)?.trim()
  if (!market)
    throw new Error(`Instrument sessionId or exchange is required for ${ref.symbol ?? ''}`)
  return registry.getRequired(market)
}
