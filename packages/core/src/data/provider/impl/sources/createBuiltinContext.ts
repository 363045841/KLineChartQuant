/** 宿主可创建互相隔离的内置行情管理实例。 */
import { MarketDataContext } from '../../../management/impl/context.js'
import type { MarketDataConfiguration } from '../../../management/types.js'
import { createBaostockMarketDataProvider } from './baostock.js'
import { createBinanceMarketDataProvider } from './binance.js'
import { createGotdxMarketDataProvider } from './gotdx.js'
import { createMockDataSource } from './mock.js'
import { createMt5MarketDataProvider } from './mt5.js'
import { createThsMarketDataProvider } from './ths.js'
import { createTradingviewMarketDataProvider } from './tradingview.js'

/** 每个实例创建独立 Provider 和传输闭包，不复制默认实例的运行状态。 */
export function createBuiltinMarketDataContext(
  configuration?: MarketDataConfiguration,
): MarketDataContext {
  const context = new MarketDataContext()
  const { registry } = context
  for (const create of [
    createGotdxMarketDataProvider,
    createBaostockMarketDataProvider,
    createTradingviewMarketDataProvider,
    createMt5MarketDataProvider,
    createThsMarketDataProvider,
    createBinanceMarketDataProvider,
  ])
    registry.register(create(registry))
  context.registerDataSource(createMockDataSource())
  if (configuration) context.restore(configuration)
  return context
}
