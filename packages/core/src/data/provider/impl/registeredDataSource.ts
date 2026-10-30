/** 将公开数据源接入唯一 Provider 协议；这里仅管理接口翻译、取消和订阅生命周期。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { KLineData } from '@/controllers/types.js'
import type { LiveBarsFrame, LiveBarsRequest, LiveBarsStatus, LiveBarsStream } from '../../live/types.js'
import type { BarsRequest, DataSourceInstrument, MarketDataProvider, MarketDataSource } from '../types.js'

/** 验证整根快照，价格和成交量都不是累加差值。 */
function validateBar(bar: KLineData): void {
  if (!Number.isSafeInteger(bar.timestamp) ||
    ![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) ||
    bar.high < Math.max(bar.open, bar.close, bar.low) ||
    bar.low > Math.min(bar.open, bar.close) ||
    (bar.volume !== undefined && (!Number.isFinite(bar.volume) || bar.volume < 0))) {
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'Invalid data source OHLCV bar')
  }
}

/** 构造可由宿主一次性释放的 Provider，不管理缓存、渲染或网络重连策略。 */
export function createRegisteredDataSource(source: MarketDataSource) {
  if (source.capabilities.liveBars !== undefined && source.capabilities.liveBars !== (source.bars.subscribe !== undefined))
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'liveBars capability must match bars.subscribe')
  const lifetime = new AbortController()
  const streams = new Set<LiveBarsStream>()
  const instruments = new Map<string, DataSourceInstrument>()

  /** 绑定宿主生命周期；注销后所有在途查询失效。 */
  function signalFor(signal?: AbortSignal): AbortSignal {
    const combined = signal ? AbortSignal.any([lifetime.signal, signal]) : lifetime.signal
    combined.throwIfAborted()
    return combined
  }

  /** 来源只由注册入口决定，不允许一个数据源冒充另一个来源。 */
  function remember(instrument: DataSourceInstrument) {
    if (!instrument.id || !instrument.timezone) throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'Instrument id and timezone are required')
    instruments.set(instrument.id, instrument)
    return { ...instrument, sourceId: source.id }
  }

  /** 统一按稳定 ID 解析，避免用搜索结果顺序猜测品种。 */
  async function resolve(id: string, signal?: AbortSignal) {
    const active = signalFor(signal)
    const instrument = instruments.get(id) ?? await source.instruments.resolve(id, active)
    active.throwIfAborted()
    if (instrument.id !== id) throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'Resolved instrument id does not match the request')
    return remember(instrument)
  }

  const provider: MarketDataProvider = {
    trades: source.trades,
    depth: source.depth,
    timeShare: source.timeShare,
    timeShareRange: source.timeShareRange,
    tradingCalendar: source.tradingCalendar,
    source: { id: source.id, displayName: source.name, endpointEditable: false,
      capabilities: { ...source.capabilities, liveBars: source.bars.subscribe !== undefined } },
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
        if (result.bars.length > query.limit) throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'History page exceeds the requested limit')
        let previous = -Infinity
        for (const bar of result.bars) {
          validateBar(bar)
          if (bar.timestamp <= previous || (query.beforeTimestamp !== undefined && bar.timestamp >= query.beforeTimestamp))
            throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'History must be ordered, unique and before the requested cursor')
          previous = bar.timestamp
        }
        return { instrumentId: instrument.id, period: query.period, adjustment: query.adjustment,
          barAggregation: query.barAggregation, timezone: instrument.timezone,
          volumeUnit: instrument.volumeUnit, olderData: result.olderData, data: result.bars.map((bar) => ({ ...bar })) }
      },
    },
  }

  const subscribe = source.bars.subscribe?.bind(source.bars)
  if (subscribe) Object.assign(provider, { liveBars: {
    createStream(request: LiveBarsRequest): LiveBarsStream {
      const instrument = request.instrumentId === undefined ? undefined : instruments.get(request.instrumentId)
      if (!instrument || !instrument.capabilities.bars?.periods.some((value) => value === request.period))
        throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'A resolved instrument and supported period are required for subscription')
      const period = instrument.capabilities.bars.periods.find((value) => value === request.period)!
      const adjustment = request.adjustment
      if (adjustment === undefined) throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'Subscription adjustment is required')
      const frames = new Set<(frame: LiveBarsFrame) => void>()
      const statuses = new Set<(status: LiveBarsStatus) => void>()
      const errors = new Set<(error: Error) => void>()
      let active: AbortController | undefined
      let unsubscribe: (() => void) | undefined
      let destroyed = false
      /** 已断开的订阅不能向新会话提交任何事件。 */
      function emit(frame: LiveBarsFrame): void { for (const callback of frames) callback(frame) }
      const stream: LiveBarsStream = {
        onFrame(callback) { frames.add(callback); return () => frames.delete(callback) },
        onStatus(callback) { statuses.add(callback); return () => statuses.delete(callback) },
        onError(callback) { errors.add(callback); return () => errors.delete(callback) },
        connect() {
          if (destroyed || active) return
          const abort = new AbortController()
          active = abort
          const signal = signalFor(abort.signal)
          const current = () => active === abort && !signal.aborted
          const identity = { symbol: request.symbol, period: request.period }
          const options: BarsRequest = { instrument, period, adjustment, barAggregation: request.barAggregation, signal }
          for (const callback of statuses) callback('connecting')
          try {
            // 重查屏障先于同步增量建立，查询期间的帧不会被迟到历史覆盖。
            emit({ ...identity, type: 'invalidate' })
            const stop = subscribe(options, {
              update(bar, options) {
                if (!current()) return
                try {
                  validateBar(bar)
                  emit(options?.historical ? { ...identity, type: 'historical', bar: { ...bar } } : { ...identity, type: 'update', bar: { ...bar } })
                } catch (error) {
                  for (const callback of errors) callback(error instanceof Error ? error : new Error(String(error)))
                }
              },
              invalidate() { if (current()) emit({ ...identity, type: 'invalidate' }) },
              status(status) { if (current()) for (const callback of statuses) callback(status) },
              error(error) { if (current()) for (const callback of errors) callback(error) },
            })
            if (current()) unsubscribe = stop
            else stop()
          } catch (error) {
            stream.disconnect()
            for (const callback of errors) callback(error instanceof Error ? error : new Error(String(error)))
          }
        },
        disconnect() {
          active?.abort()
          active = undefined
          const stop = unsubscribe
          unsubscribe = undefined
          stop?.()
          for (const callback of statuses) callback('disconnected')
        },
        destroy() {
          destroyed = true
          stream.disconnect()
          frames.clear(); statuses.clear(); errors.clear(); streams.delete(stream)
        },
      }
      streams.add(stream)
      return stream
    },
  } })

  return { provider, dispose() {
    lifetime.abort()
    for (const stream of streams) stream.destroy()
    instruments.clear()
  } }
}
