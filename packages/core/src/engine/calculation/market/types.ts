/**
 * 计算行情契约：由会话持有，只服务于计算结果，不承载图表状态。
 */
import type { MarketDataProviderRegistry } from '@/data/provider/impl/registry.js'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import type { CalculationMarketData } from '../types.js'

export interface CalculationMarketOptions {
  readonly registry: MarketDataProviderRegistry
  readonly marketSessions: MarketSessionRegistry
}

/** 会话级计算行情：上下文读取与租约回收，生命周期随会话。 */
export interface CalculationMarket extends CalculationMarketData {
  dispose(): void
}
