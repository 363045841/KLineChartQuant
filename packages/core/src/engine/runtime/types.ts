/**
 * 共享运行时契约：行情、定义、计算与取数服务的唯一组合。
 *
 * 不持有图表、宿主席位或 UI；Chart、Alert 与计算都是它的消费者。
 */
import type { MarketDataContext } from '@/data/management/context.js'
import type { MarketDataService } from '@/data/service/index.js'
import type { CalculationHub } from '../calculation/index.js'
import type { MarketSessionRegistry } from '@/foundation/config/marketSession/marketSessionRegistry.js'
import type { MarketSessionConfig } from '@/foundation/utils/sessionTimeLabels.js'
import type { Clock } from '@/foundation/utils/clock.js'
import type { DefinitionRegistry } from '../indicators/registry/index.js'

export interface MarketRuntimeOptions {
  readonly market: MarketDataContext
  readonly definitions: DefinitionRegistry
  /** 图表级市场时段覆盖；数据源声明仍由运行时统一合并。 */
  readonly marketSessions?: Readonly<Record<string, MarketSessionConfig>>
  /** 宿主持有的时钟；时间相关查询不读取全局时间。 */
  readonly clock: Clock
}

export interface MarketRuntime {
  readonly market: MarketDataContext
  readonly definitions: DefinitionRegistry
  readonly calculation: CalculationHub
  readonly marketSessions: MarketSessionRegistry
  /** 唯一取数入口；图表、计算与警报共用。 */
  readonly data: MarketDataService
  dispose(): void
}
