/**
 * 共享运行时契约：行情、定义与计算的唯一组合。
 *
 * 不持有图表、宿主席位或 UI；Chart 与 Alert 都是它的消费者。
 */
import type { MarketDataContext } from '@/data/management/impl/context.js'
import type { CalculationHub } from '../calculation/index.js'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import type { MarketSessionConfig } from '@/foundation/utils/sessionTimeLabels.js'
import type { DefinitionRegistry } from '../indicators/registry/index.js'

export interface MarketRuntimeOptions {
  readonly market: MarketDataContext
  readonly definitions: DefinitionRegistry
  /** 图表级市场时段覆盖；数据源声明仍由运行时统一合并。 */
  readonly marketSessions?: Readonly<Record<string, MarketSessionConfig>>
}

export interface MarketRuntime {
  readonly market: MarketDataContext
  readonly definitions: DefinitionRegistry
  readonly calculation: CalculationHub
  readonly marketSessions: MarketSessionRegistry
  dispose(): void
}
