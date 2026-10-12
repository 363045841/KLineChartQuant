/** 将宿主的 Core 行情管理实例提供给图表子组件。 */
import {
  defaultMarketDataContext,
  type MarketDataContext,
} from '@363045841yyt/klinechart-core/market-data'
import { getCurrentInstance, type InjectionKey, inject, provide } from 'vue'

export const MARKET_DATA_CONTEXT_KEY: InjectionKey<MarketDataContext> = Symbol('MarketDataContext')

/** 宿主或图表提供实例；消费者卸载不释放宿主实例。 */
export function provideMarketDataContext(context: MarketDataContext): MarketDataContext {
  provide(MARKET_DATA_CONTEXT_KEY, context)
  return context
}

/** 优先使用宿主注入，保留默认实例兼容旧宿主。 */
export function useMarketDataContext(): MarketDataContext {
  return getCurrentInstance()
    ? inject(MARKET_DATA_CONTEXT_KEY, defaultMarketDataContext)
    : defaultMarketDataContext
}
