/** 会话表的唯一装配入口：内置表为底，叠加数据源声明与图表覆盖，后者优先。 */
import type { MarketSessionConfig } from '../../utils/sessionTimeLabels.js'
import type { MarketSessionRegistry } from './marketSessionRegistry.js'

/** 声明私有会话的数据源形状；只依赖注册所需的字段。 */
export interface MarketSessionSource {
  readonly marketSessions?: Readonly<Record<string, MarketSessionConfig>>
}

/**
 * 把数据源声明的会话与图表级覆盖写入同一个注册表。
 *
 * 共享时段只在内置表定义一次；数据源与图表只声明差异，避免同一 sessionId 两处维护。
 *
 * @param registry 目标注册表，构造时已铺好内置表
 * @param sources 数据源集合，同 id 时后面的覆盖前面的
 * @param overrides 图表级覆盖，优先级最高
 */
export function applyMarketSessions(
  registry: MarketSessionRegistry,
  sources: Iterable<MarketSessionSource>,
  overrides?: Readonly<Record<string, MarketSessionConfig>>,
): void {
  for (const source of sources) {
    for (const [id, config] of Object.entries(source.marketSessions ?? {})) {
      registry.register(id, config)
    }
  }
  for (const [id, config] of Object.entries(overrides ?? {})) {
    registry.register(id, config)
  }
}
