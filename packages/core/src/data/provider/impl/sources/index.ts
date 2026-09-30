/**
 * 内置行情 Provider 注册入口。
 *
 * 导入即通过各源模块的加载副作用完成注册；本文件是内置源清单的单一事实来源，
 * 数据层总出口与需要一次性装配全量源的宿主（如 Web Component 入口）共用。
 * 导入顺序即注册顺序，会作为同优先级源在 auto 路由时的尝试顺序，勿随意调整。
 */
import './gotdx.js'
import './baostock.js'
import './finshare.js'
import './tradingview.js'
import './mock.js'
import './mt5.js'

export { baostockMarketDataProvider } from './baostock.js'
export { finshareMarketDataProvider } from './finshare.js'
export { gotdxMarketDataProvider } from './gotdx.js'
export { mockMarketDataProvider } from './mock.js'
export { mt5MarketDataProvider } from './mt5.js'
export { tradingviewMarketDataProvider } from './tradingview.js'
