/**
 * 计算组合：行情、定义与计算中枢由同一个运行时持有。
 */
import {
  createMarketRuntime,
  systemClock,
  type DefinitionRegistry,
  type MarketDataContext,
  type MarketRuntime,
} from '@363045841yyt/klinechart-core/node'

/**
 * 创建共享运行时。
 *
 * @param market - 行情宿主
 * @param definitions - 定义注册表
 * @returns 图表与警报共享的运行时
 */
export function composeRuntime(
  market: MarketDataContext,
  definitions: DefinitionRegistry,
): MarketRuntime {
  return createMarketRuntime({ market, definitions, clock: systemClock })
}
