/** Binance 源只负责标准 Provider 装配，不创建专用图表或指标生命周期。 */
import { BarsLiveSource } from '../../../live/impl/barsLive.js'
import { createTradeDataSource } from '../../../trades/impl/tradeSource.js'
import { createHttpMarketDataTransport, createMarketDataProvider } from '../../protocol/index.js'
import { marketDataProviderRegistry } from '../registry.js'
import { dataSourceRegistry } from '../sourceRegistry.js'

const source = dataSourceRegistry.binance
const baseUrl = () =>
  marketDataProviderRegistry.getConfig(source.id).baseUrl ?? source.defaultBaseUrl
const transport = createHttpMarketDataTransport({ baseUrl, sourceLabel: source.id })
export const binanceMarketDataProvider = createMarketDataProvider({
  source,
  transport,
  trades: createTradeDataSource(source.id, transport, baseUrl),
  liveBars: {
    createStream({ symbol, period, barAggregation }) {
      return new BarsLiveSource(source.id, symbol, period, barAggregation, baseUrl())
    },
  },
})
if (!marketDataProviderRegistry.get(source.id))
  marketDataProviderRegistry.register(binanceMarketDataProvider)
