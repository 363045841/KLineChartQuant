/**
 * 内置 HTTP 源清单的单一事实来源：数组顺序即注册顺序，也是同优先级源在 auto 路由中的尝试顺序。
 * 默认宿主与独立宿主共用这一份清单，新增源只在这里追加一次。
 */
import type { MarketDataProviderRegistry } from '../registry.js'
import { createBaostockMarketDataProvider } from './baostock.js'
import { createBinanceMarketDataProvider } from './binance.js'
import { createGotdxMarketDataProvider } from './gotdx.js'
import { createMt5MarketDataProvider } from './mt5.js'
import { createThsMarketDataProvider } from './ths.js'
import { createTradingviewMarketDataProvider } from './tradingview.js'

/** 内置源工厂列表；顺序影响同优先级源的 auto 路由顺序。 */
export const BUILTIN_PROVIDER_FACTORIES = [
  createGotdxMarketDataProvider,
  createBaostockMarketDataProvider,
  createTradingviewMarketDataProvider,
  createMt5MarketDataProvider,
  createThsMarketDataProvider,
  createBinanceMarketDataProvider,
] as const

/**
 * 按清单顺序创建并注册内置源，供默认宿主与独立宿主共用。
 *
 * 同一个 core 可能被打进多份 bundle，模块副作用会重复执行；同 id 已存在时保留先注册的定义。
 */
export function installBuiltinProviders(registry: MarketDataProviderRegistry): void {
  for (const create of BUILTIN_PROVIDER_FACTORIES) {
    const provider = create(registry)
    if (!registry.get(provider.source.id)) registry.register(provider)
  }
}
