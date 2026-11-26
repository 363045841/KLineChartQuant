/**
 * 内置行情源入口。
 *
 * 只导出工厂与安装函数；不创建全局注册表，也不在 import 时注册任何源。
 */
export { BUILTIN_PROVIDER_FACTORIES, installBuiltinProviders } from './builtinProviders.js'
export { createBuiltinMarketDataContext } from './createBuiltinContext.js'
export { createBaostockMarketDataProvider } from './baostock.js'
export { createBinanceMarketDataProvider } from './binance.js'
export { createGotdxMarketDataProvider } from './gotdx.js'
export { createMockDataSource } from './mock.js'
export { createMt5MarketDataProvider } from './mt5.js'
export { createThsMarketDataProvider } from './ths.js'
export { createTradingviewMarketDataProvider } from './tradingview.js'
