/**
 * 计算行情契约：由会话持有，只服务于计算结果，不承载图表状态。
 */import type { MarketDataService } from '@/data/service/index.js'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import type { CalculationMarketData } from '../types.js'

export interface CalculationMarketOptions {
  /** 唯一行情服务；计算不再创建自己的缓存或订阅。 */
  readonly data: MarketDataService
  readonly marketSessions: MarketSessionRegistry
}

/** 会话级计算行情：上下文读取与租约回收，生命周期随会话。 */
export interface CalculationMarket extends CalculationMarketData {
  dispose(): void
}
