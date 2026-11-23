/** 将公开数据源接入唯一 Provider 协议；这里仅管理接口翻译、鉴权与取消。 */

import type { KLineData } from '@/controllers/types.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { DataSourceInstrument, MarketDataProvider, MarketDataSource } from '../types.js'

/** 验证整根快照，价格和成交量都不是累加差值。 */
function validateBar(bar: KLineData): void {
  if (
    !Number.isSafeInteger(bar.timestamp) ||
    ![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) ||
    bar.high < Math.max(bar.open, bar.close, bar.low) ||
    bar.low > Math.min(bar.open, bar.close) ||
    (bar.volume !== undefined && (!Number.isFinite(bar.volume) || bar.volume < 0))
  ) {
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'Invalid data source OHLCV bar')
  }
}

/** 构造可由宿主一次性释放的 Provider；不管理缓存、渲染或连接策略。 */
export function createRegisteredDataSource(source: MarketDataSource) {
  if (
    source.capabilities.liveBars !== undefined &&
    source.capabilities.liveBars !== (source.stream !== undefined)
  )
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      'liveBars capability must match the presence of a stream transport',
    )

  const lifetime = new AbortController()
  const instruments = new Map<string, DataSourceInstrument>()

  /** 绑定宿主生命周期；注销后所有在途查询失效。 */
  function signalFor(signal?: AbortSignal): AbortSignal {
    const combined = signal ? AbortSignal.any([lifetime.signal, signal]) : lifetime.signal
    combined.throwIfAborted()
    return combined
  }

  /** 来源只由注册入口决定，不允许一个数据源冒充另一个来源。 */
  function remember(instrument: DataSourceInstrument) {
    if (!instrument.id || !instrument.timezone)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'Instrument id and timezone are required',
      )
    instruments.set(instrument.id, instrument)
    return { ...instrument, source: source.id }
  }

  /** 统一按稳定 ID 解析，避免用搜索结果顺序猜测品种。 */
  async function resolve(id: string, signal?: AbortSignal) {
    const active = signalFor(signal)
    const instrument = instruments.get(id) ?? (await source.instruments.resolve(id, active))
    active.throwIfAborted()
    if (instrument.id !== id)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'Resolved instrument id does not match the request',
      )
    return remember(instrument)
  }

  const provider: MarketDataProvider = {
    trades: source.trades,
    depth: source.depth,
    timeShare: source.timeShare,
    timeShareRange: source.timeShareRange,
    tradingCalendar: source.tradingCalendar,
    ...(source.stream === undefined ? {} : { stream: source.stream }),
    source: {
      id: source.id,
      displayName: source.name,
      endpointEditable: false,
      capabilities: { ...source.capabilities, liveBars: source.stream !== undefined },
    },
    async probe(signal) {
      signalFor(signal)
      return { status: 'online', checkedAt: Date.now(), capabilities: provider.source.capabilities }
    },
    catalog: {
      resolve,
      async search(query) {
        const signal = signalFor(query.signal)
        const result = await source.instruments.search({ ...query, signal })
        signal.throwIfAborted()
        return result.map(remember)
      },
    },
    bars: {
      async fetch(query) {
        const signal = signalFor(query.signal)
        await resolve(query.instrument.id, signal)
        const instrument = instruments.get(query.instrument.id)!
        const result = await source.bars.fetch({ ...query, instrument, signal })
        signal.throwIfAborted()
        if (result.bars.length > query.limit)
          throw new KLineChartError(
            GENERIC_ERROR_CODES.INVALID_PARAM,
            'History page exceeds the requested limit',
          )
        let previous = -Infinity
        for (const bar of result.bars) {
          validateBar(bar)
          if (
            bar.timestamp <= previous ||
            (query.beforeTimestamp !== undefined && bar.timestamp >= query.beforeTimestamp)
          )
            throw new KLineChartError(
              GENERIC_ERROR_CODES.INVALID_PARAM,
              'History must be ordered, unique and before the requested cursor',
            )
          previous = bar.timestamp
        }
        return {
          instrumentId: instrument.id,
          period: query.period,
          adjustment: query.adjustment,
          barAggregation: query.barAggregation,
          timezone: instrument.timezone,
          volumeUnit: instrument.volumeUnit,
          olderData: result.olderData,
          data: result.bars.map((bar) => ({ ...bar })),
        }
      },
    },
  }

  return {
    provider,
    dispose() {
      lifetime.abort()
      instruments.clear()
    },
  }
}
