/**
 * 用宿主实例的注册表装配 HTTP Provider。
 *
 * 传输、事件流与 fetch 都由组合根注入；Provider 自己声明实时流能力，
 * 行情宿主不再替数据源选择连接实现。
 */
import { createSseTransport } from '@/data/stream/impl/sseTransport.js'
import type { EventStreamFactory } from '@/data/stream/types.js'
import { createTradeDataSource } from '@/data/trades/impl/tradeSource.js'
import type { MarketDataProviderOptions } from '../../protocol/index.js'
import { createHttpMarketDataTransport, createMarketDataProvider } from '../../protocol/index.js'
import type { MarketDataProviderRegistry } from '../../registry.js'
import type { MarketDataProvider } from '../../types.js'
import type { DataSourceRegistration } from '../sourceRegistry.js'

/** 装配 HTTP 数据源所需的宿主能力；六个内置源共用同一份形状。 */
export interface HttpSourceOptions {
  /** 宿主 fetch，不允许回退到全局。 */
  readonly fetchImpl: typeof fetch
  /** 宿主事件流，K 线 SSE 与实时成交共用。 */
  readonly openEventStream: EventStreamFactory
  /** 是否同时装配成交流。 */
  readonly trades?: boolean
  /** 后端未返回成交量单位时的兜底推断。 */
  readonly resolveVolumeUnit?: MarketDataProviderOptions['resolveVolumeUnit']
}

/**
 * 内置源的唯一 HTTP 装配实现。
 *
 * @param source - 数据源注册信息
 * @param registry - 宿主实例的注册表，用于读取生效地址
 * @param options - 宿主 fetch、事件流与能力配置
 * @returns 声明了实时流的 Provider
 */
export function createHttpSource(
  source: DataSourceRegistration,
  registry: MarketDataProviderRegistry,
  options: HttpSourceOptions,
): MarketDataProvider {
  const baseUrl = () => registry.getConfig(source.id).baseUrl ?? source.defaultBaseUrl ?? ''
  const transport = createHttpMarketDataTransport({
    baseUrl,
    fetchImpl: options.fetchImpl,
    sourceLabel: source.id,
  })
  const provider = createMarketDataProvider({
    source: { ...source },
    transport,
    ...(options.resolveVolumeUnit ? { resolveVolumeUnit: options.resolveVolumeUnit } : {}),
    ...(options.trades
      ? {
          trades: createTradeDataSource(
            source.id,
            transport,
            baseUrl,
            options.openEventStream,
          ),
        }
      : {}),
  })
  // 实时流由 Provider 自己声明，行情宿主只做转发，不替数据源选择实现。
  return { ...provider, stream: createSseTransport(options.openEventStream, baseUrl) }
}
