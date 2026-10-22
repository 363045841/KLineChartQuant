/** 用宿主实例的注册表装配 HTTP Provider，传输不闭包捕获全局配置。 */
import { BarsLiveSource } from '@/data/live/impl/barsLive.js'
import { createTradeDataSource } from '@/data/trades/impl/tradeSource.js'
import type { MarketDataProviderOptions } from '../../protocol/index.js'
import { createHttpMarketDataTransport, createMarketDataProvider } from '../../protocol/index.js'
import type { MarketDataProviderRegistry } from '../registry.js'
import type { DataSourceRegistration } from '../sourceRegistry.js'

/** 内置源装配的唯一 HTTP 接入实现。 */
export function createHttpSource(
  source: DataSourceRegistration,
  registry: MarketDataProviderRegistry,
  options: {
    liveBars?: boolean
    trades?: boolean
    resolveVolumeUnit?: MarketDataProviderOptions['resolveVolumeUnit']
  } = {},
) {
  const baseUrl = () => registry.getConfig(source.id).baseUrl ?? source.defaultBaseUrl ?? ''
  const transport = createHttpMarketDataTransport({ baseUrl, sourceLabel: source.id })
  return createMarketDataProvider({
    source: { ...source },
    transport,
    ...(options.resolveVolumeUnit ? { resolveVolumeUnit: options.resolveVolumeUnit } : {}),
    ...(options.trades ? { trades: createTradeDataSource(source.id, transport, baseUrl) } : {}),
    ...(options.liveBars
      ? {
          liveBars: {
            createStream(request) {
              return new BarsLiveSource(source.id, request, baseUrl())
            },
          },
        }
      : {}),
  })
}
