/**
 * 全仓唯一的实时连接实现：EventSource + 批量品种参数 + 帧解析。
 *
 * 连接身份由池决定；这里只负责把一条连接请求变成 URL、把原始帧转成 LiveFrame。
 */

import { ERROR_CODES, GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { V1_ENDPOINTS } from '../../provider/protocol/types.js'
import type {
  LiveBar,
  LiveFrame,
  RealtimeChannel,
  RealtimeConnection,
  RealtimeConnectionRequest,
  RealtimeStatus,
} from '../types.js'

/** 通道对应的端点路径段；两个通道都挂在 sources/:sourceId 下。 */
const CHANNEL_PATHS = {
  bars: 'stream',
  quotes: 'quotes',
} as const satisfies Record<RealtimeChannel, string>

/** 读取有限数值；非 number 或 NaN 一律视为协议错误。 */
function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 解析 K 线载荷；字段缺失直接判为无效帧。 */
function readBar(value: unknown): LiveBar | null {
  if (!value || typeof value !== 'object') return null
  const bar = value as Record<string, unknown>
  const timestamp = readNumber(bar.timestamp)
  const open = readNumber(bar.open)
  const high = readNumber(bar.high)
  const low = readNumber(bar.low)
  const close = readNumber(bar.close)
  if (timestamp === null || open === null || high === null || low === null || close === null)
    return null
  const volume = readNumber(bar.volume)
  const turnover = readNumber(bar.turnover)
  return {
    timestamp,
    open,
    high,
    low,
    close,
    ...(volume === null ? {} : { volume }),
    ...(turnover === null ? {} : { turnover }),
  }
}

/** 把原始载荷解析为通道对应的帧；未知类型视为协议错误。 */
function readFrame(channel: RealtimeChannel, raw: unknown): LiveFrame {
  if (!raw || typeof raw !== 'object') throw new TypeError('Live frame must be an object')
  const frame = raw as Record<string, unknown>
  const instrumentId = frame.instrumentId
  if (typeof instrumentId !== 'string' || instrumentId === '')
    throw new TypeError('Live frame requires instrumentId')
  const type = frame.type
  if (channel === 'quotes') {
    if (type !== 'quote') throw new TypeError(`Unknown quote frame: ${String(type)}`)
    const last = readNumber(frame.last)
    const prevClose = readNumber(frame.prevClose)
    const timestamp = readNumber(frame.timestamp)
    if (last === null || prevClose === null || timestamp === null)
      throw new TypeError('Quote frame requires last, prevClose and timestamp')
    return { channel: 'quotes', type: 'quote', instrumentId, quote: { last, prevClose, timestamp } }
  }
  if (type === 'snapshot') {
    if (!Array.isArray(frame.bars)) throw new TypeError('Snapshot frame requires bars')
    const bars = frame.bars.map(readBar)
    if (bars.some((bar) => bar === null)) throw new TypeError('Snapshot frame has invalid bars')
    return { channel: 'bars', type: 'snapshot', instrumentId, bars: bars as LiveBar[] }
  }
  if (type === 'invalidate') return { channel: 'bars', type: 'invalidate', instrumentId }
  if (type === 'status') {
    if (typeof frame.status !== 'string') throw new TypeError('Status frame requires status')
    return {
      channel: 'bars',
      type: 'status',
      instrumentId,
      status: frame.status,
      ...(typeof frame.detail === 'string' ? { detail: frame.detail } : {}),
    }
  }
  if (type === 'update' || type === 'historical' || type === 'closed' || type === 'forming') {
    const bar = readBar(frame.bar)
    if (bar === null) throw new TypeError(`${type} frame requires a valid bar`)
    return { channel: 'bars', type, instrumentId, bar }
  }
  throw new TypeError(`Unknown bars frame: ${String(type)}`)
}

/** 组装批量订阅 URL：品种身份一律用 instrumentId，服务端不再按 symbol 猜测。 */
function buildUrl(request: RealtimeConnectionRequest, baseUrl: string): string {
  if (request.instrumentIds.length === 0)
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'Live connection requires instruments')
  const params = new URLSearchParams({ instruments: request.instrumentIds.join(',') })
  if (request.channel === 'bars') {
    if (request.period === undefined || request.adjustment === undefined)
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'Bars subscription requires period and adjustment')
    params.set('period', request.period)
    params.set('adjustment', request.adjustment)
    if (request.barAggregation !== undefined) params.set('barAggregation', request.barAggregation)
  }
  const source = encodeURIComponent(request.sourceId)
  return `${baseUrl}${V1_ENDPOINTS.sources}/${source}/${CHANNEL_PATHS[request.channel]}?${params.toString()}`
}

/** 连接只需要 EventSource 的四个成员；测试用替身满足同一形状。 */
export interface LiveEventSource {
  onopen: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  close(): void
}

/**
 * 创建一条 SSE 实时连接。
 *
 * @param request - 连接的通道、品种集合与序列参数
 * @param baseUrl - 数据源生效地址
 * @param esFactory - 事件源工厂；测试注入替身
 */
export function createSseConnection(
  request: RealtimeConnectionRequest,
  baseUrl: string,
  esFactory?: (url: string) => LiveEventSource,
): RealtimeConnection {
  const frameCbs = new Set<(frame: LiveFrame) => void>()
  const statusCbs = new Set<(status: RealtimeStatus) => void>()
  const errorCbs = new Set<(error: Error) => void>()
  let source: LiveEventSource | null = null
  let destroyed = false

  /** 广播连接状态；销毁后静默。 */
  function emitStatus(status: RealtimeStatus): void {
    if (destroyed) return
    for (const callback of statusCbs) callback(status)
  }

  /** 广播解析错误；单帧错误不影响连接继续收流。 */
  function emitError(error: Error): void {
    if (destroyed) return
    for (const callback of errorCbs) callback(error)
  }

  const connection: RealtimeConnection = {
    onFrame(callback) {
      frameCbs.add(callback)
      return () => frameCbs.delete(callback)
    },
    onStatus(callback) {
      statusCbs.add(callback)
      return () => statusCbs.delete(callback)
    },
    onError(callback) {
      errorCbs.add(callback)
      return () => errorCbs.delete(callback)
    },
    connect() {
      if (destroyed || source !== null) return
      emitStatus('connecting')
      const factory = esFactory ?? ((url: string) => new EventSource(url))
      source = factory(buildUrl(request, baseUrl))
      source.onopen = () => emitStatus('connected')
      source.onerror = () => {
        // EventSource 原生重连；这里只报告状态，不自行销毁。
        emitStatus('disconnected')
      }
      source.onmessage = (event: MessageEvent) => {
        if (destroyed) return
        const data = event.data as string
        if (data === '' || data.startsWith(':')) return
        try {
          const frame = readFrame(request.channel, JSON.parse(data) as unknown)
          for (const callback of frameCbs) callback(frame)
        } catch (error) {
          emitError(
            new KLineChartError(
              ERROR_CODES.FETCH_FAILED,
              `Live frame parse error: ${error instanceof Error ? error.message : String(error)}`,
            ),
          )
        }
      }
    },
    disconnect() {
      if (source === null) return
      source.close()
      source = null
      emitStatus('disconnected')
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      source?.close()
      source = null
      frameCbs.clear()
      statusCbs.clear()
      errorCbs.clear()
    },
  }

  return connection
}
