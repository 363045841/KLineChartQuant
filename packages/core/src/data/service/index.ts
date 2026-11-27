/** 行情服务公开入口：契约、实现与依赖选项。 */
export { createMarketDataService, type MarketDataServiceOptions } from './impl/createMarketDataService.js'
export { resolveBarsSelection } from './impl/createMarketDataService.js'
export type {
  BarsOptions,
  BarsPage,
  BarsPageRequest,
  BarsSeries,
  BarsSymbolRequest,
  MarketDataService,
  TimeShareOptions,
  TimeShareSeries,
  TradesSeries,
} from './types.js'
