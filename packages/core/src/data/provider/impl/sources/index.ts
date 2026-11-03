/**
 * 内置行情源注册入口。
 *
 * HTTP 源清单只维护在 builtinProviders.ts；本文件把它们装进默认宿主，再按公开注册 API
 * 注册 mock。安装顺序即注册顺序，也是同优先级源在 auto 路由中的尝试顺序。
 */
import { DataSource } from '@363045841yyt/klinechart-plot-contracts'
import { defaultMarketDataContext } from '../../../management/impl/context.js'
import { marketDataProviderRegistry } from '../registry.js'
import { installBuiltinProviders } from './builtinProviders.js'
import { createMockDataSource } from './mock.js'

installBuiltinProviders(marketDataProviderRegistry)
defaultMarketDataContext.registerDataSource(createMockDataSource())

/** 默认宿主中的内置源实例；类型统一为 Provider 契约。 */
export const gotdxMarketDataProvider = marketDataProviderRegistry.getRequired(DataSource.Gotdx)
export const baostockMarketDataProvider = marketDataProviderRegistry.getRequired(
  DataSource.BaoStock,
)
export const tradingviewMarketDataProvider = marketDataProviderRegistry.getRequired(
  DataSource.TradingView,
)
export const mt5MarketDataProvider = marketDataProviderRegistry.getRequired(DataSource.MT5)
export const thsMarketDataProvider = marketDataProviderRegistry.getRequired(DataSource.THS)
export const binanceMarketDataProvider = marketDataProviderRegistry.getRequired(DataSource.Binance)

export { createBuiltinMarketDataContext } from './createBuiltinContext.js'
export { createMockDataSource } from './mock.js'
