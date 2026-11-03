/** 行情宿主模块的对外契约。 */
import type { MarketDataContext } from '@363045841yyt/klinechart-core/market-data'

/** 带持久化的行情宿主；实例生命周期归创建方所有。 */
export interface PersistedMarketDataHost {
  /** 已注册内置数据源并恢复过配置的管理实例。 */
  readonly context: MarketDataContext
  /** 停止配置监听并释放行情实例。 */
  dispose(): void
}
