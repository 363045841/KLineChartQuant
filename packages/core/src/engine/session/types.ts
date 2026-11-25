/**
 * 计算会话契约：持有行情、定义解析与计算中枢，供图表与警报共同消费。
 */
import type { CalculationHub } from '../calculation/index.js'
import type { MarketDataProviderRegistry } from '@/data/provider/impl/registry.js'
import type { MarketSessionConfig } from '@/foundation/utils/sessionTimeLabels.js'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'

export interface CalculationSessionOptions {
  readonly registry: MarketDataProviderRegistry
  /** 图表级市场时段覆盖；数据源声明仍由会话统一合并。 */
  readonly marketSessions?: Readonly<Record<string, MarketSessionConfig>>
}

/** 一个会话只创建一份计算中枢；消费者只持有引用，不负责释放。 */
export interface CalculationSession {
  readonly hub: CalculationHub
  readonly marketSessions: MarketSessionRegistry
  dispose(): void
}
