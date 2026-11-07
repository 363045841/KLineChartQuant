/** 将公开数据源接入唯一 Provider 协议；这里仅管理接口翻译、取消和订阅生命周期。 */

import type { KLineData } from '@/controllers/types.js'
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { createRealtimeCallbackHub } from '../../live/impl/callbackHub.js'
import type {
  RealtimeConnection,
  RealtimeConnectionRequest,
  RealtimeStatus,
} from '../../live/types.js'
import type {
  BarsObserver,
  BarsRequest,
  DataSourceInstrument,
  MarketDataProvider,
  MarketDataSource,
} from '../types.js'

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

/** 宿主订阅的批量拆解结果：每个品种一条 BarsRequest 与帧身份。 */
function hostSubscriptionTargets(
  request: RealtimeConnectionRequest,
  instruments: ReadonlyMap<string, DataSourceInstrument>,
): ReadonlyArray<{ instrument: DataSourceInstrument; options: Omit<BarsRequest, 'signal'> }> {
  if (request.channel !== 'bars')
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      'Host data sources provide bars realtime only',
    )
  const period = request.period
  const adjustment = request.adjustment
  const barAggregation = request.barAggregation
  if (period === undefined || adjustment === undefined || barAggregation === undefined)
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      'Host bars subscription requires period, aggregation and adjustment',
    )
  return request.instrumentIds.map((id) => {
    const instrument = instruments.get(id)
    if (!instrument)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'Instrument must be resolved before subscription',
      )
    if (!instrument.capabilities.bars?.periods.some((value) => value === period))
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'Instrument does not support the requested period',
      )
    return {
      instrument,
      options: { instrument, period, adjustment, barAggregation },
    }
  })
}

/**
 * 把宿主数据源的按品种订阅适配成池连接。
 *
 * 池的连接请求是批量品种，这里逐品种订阅并合并状态；帧一律带 instrumentId，
 * 下游不再依赖 symbol 猜测身份。
 */
function createHostRealtimeConnection(
  request: RealtimeConnectionRequest,
  subscribe: NonNullable<MarketDataSource['bars']['subscribe']>,
  instruments: ReadonlyMap<string, DataSourceInstrument>,
  signalFor: (signal?: AbortSignal) => AbortSignal,
): RealtimeConnection {
  const targets = hostSubscriptionTargets(request, instruments)
  const hub = createRealtimeCallbackHub()
  const statuses = new Map<string, RealtimeStatus>()
  const lifetime = new AbortController()
  const stops: Array<() => void> = []
  let destroyed = false

  /** 合并各品种状态：全部断开才算断开，任一连接中即连接中。 */
  function aggregateStatus(): RealtimeStatus {
    const values = [...statuses.values()]
    if (values.length === 0) return 'connecting'
    if (values.every((value) => value === 'disconnected')) return 'disconnected'
    if (values.some((value) => value === 'connecting')) return 'connecting'
    return 'connected'
  }

  const connection: RealtimeConnection = {
    onFrame: hub.onFrame,
    onStatus: hub.onStatus,
    onError: hub.onError,
    connect() {
      if (destroyed || stops.length > 0) return
      const signal = signalFor(lifetime.signal)
      for (const { instrument, options } of targets) {
        if (destroyed) return
        const instrumentId = instrument.id
        statuses.set(instrumentId, 'connecting')
        // 重查屏障先于同步增量建立，查询期间的帧不会被迟到历史覆盖。
        hub.emitFrame({ channel: 'bars', type: 'invalidate', instrumentId })
        const observer: BarsObserver = {
          update(bar, updateOptions) {
            if (destroyed) return
            try {
              validateBar(bar)
              hub.emitFrame({
                channel: 'bars',
                type: updateOptions?.historical ? 'historical' : 'update',
                instrumentId,
                bar: { ...bar },
              })
            } catch (error) {
              hub.emitError(error instanceof Error ? error : new Error(String(error)))
            }
          },
          invalidate() {
            if (!destroyed) hub.emitFrame({ channel: 'bars', type: 'invalidate', instrumentId })
          },
          status(status) {
            if (destroyed) return
            statuses.set(instrumentId, status)
            hub.emitStatus(aggregateStatus())
          },
          error(error) {
            if (destroyed) return
            hub.emitError(error instanceof Error ? error : new Error(String(error)))
          },
        }
        try {
          const stop = subscribe({ ...options, signal }, observer)
          // 宿主可能同步报告断开，池已销毁本次连接时必须立即释放刚返回的句柄。
          if (destroyed) stop()
          else stops.push(stop)
        } catch (error) {
          hub.emitError(error instanceof Error ? error : new Error(String(error)))
          statuses.set(instrumentId, 'disconnected')
          hub.emitStatus(aggregateStatus())
        }
      }
      hub.emitStatus(aggregateStatus())
    },
    disconnect() {
      lifetime.abort()
      for (const stop of stops.splice(0)) stop()
      statuses.clear()
      hub.emitStatus('disconnected')
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      // 先关闭回调表面，销毁过程不再向订阅者投递状态。
      hub.close()
      connection.disconnect()
    },
  }

  return connection
}

/** 构造可由宿主一次性释放的 Provider，不管理缓存、渲染或网络重连策略。 */
export function createRegisteredDataSource(source: MarketDataSource) {
  if (
    source.capabilities.liveBars !== undefined &&
    source.capabilities.liveBars !== (source.bars.subscribe !== undefined)
  )
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      'liveBars capability must match bars.subscribe',
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
    return { ...instrument, sourceId: source.id }
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

  const subscribe = source.bars.subscribe?.bind(source.bars)
  const provider: MarketDataProvider = {
    trades: source.trades,
    depth: source.depth,
    timeShare: source.timeShare,
    timeShareRange: source.timeShareRange,
    tradingCalendar: source.tradingCalendar,
    ...(subscribe
      ? {
          realtime: (request: RealtimeConnectionRequest) =>
            createHostRealtimeConnection(request, subscribe, instruments, signalFor),
        }
      : {}),
    source: {
      id: source.id,
      displayName: source.name,
      endpointEditable: false,
      capabilities: { ...source.capabilities, liveBars: source.bars.subscribe !== undefined },
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
