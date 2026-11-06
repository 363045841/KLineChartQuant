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
} from '../types.js'
import { createRealtimeCallbackHub } from './callbackHub.js'

/** 通道对应的端点路径段；两个通道都挂在 sources/:sourceId 下。 */
const CHANNEL_PATHS = {
  bars: 'stream',
  quotes: 'quotes',
} as const satisfies Record<RealtimeChannel, string>

/** 帧信封：类型标签与品种身份由所有通道共享，后续分支只解析各自载荷。 */
interface FrameEnvelope {
  readonly type: unknown
  readonly instrumentId: string
  readonly payload: Record<string, unknown>
}

/** K 线更新帧的类型集合；四种类型共用同一份 bar 载荷。 */
const BAR_UPDATE_TYPES: ReadonlySet<unknown> = new Set([
  'update',
  'historical',
  'closed',
  'forming',
])

/** 读取有限数值；非 number 或 NaN 一律视为协议错误。 */
function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** K 线必填字段；量额可选，缺失时由 readBar 决定是否写入。 */
type BarCore = Pick<LiveBar, 'timestamp' | 'open' | 'high' | 'low' | 'close'>

/** 读取 K 线必填字段；任一缺失都视为无效载荷。 */
function readBarCore(bar: Record<string, unknown>): BarCore | null {
  const timestamp = readNumber(bar.timestamp)
  const open = readNumber(bar.open)
  const high = readNumber(bar.high)
  const low = readNumber(bar.low)
  const close = readNumber(bar.close)
  if (timestamp === null || open === null || high === null || low === null || close === null)
    return null
  return { timestamp, open, high, low, close }
}

/** 解析 K 线载荷；必填字段缺失直接判为无效帧，量额缺失则省略。 */
function readBar(value: unknown): LiveBar | null {
  if (!value || typeof value !== 'object') return null
  const bar = value as Record<string, unknown>
  const core = readBarCore(bar)
  if (core === null) return null
  const volume = readNumber(bar.volume)
  const turnover = readNumber(bar.turnover)
  return {
    ...core,
    ...(volume === null ? {} : { volume }),
    ...(turnover === null ? {} : { turnover }),
  }
}

/** 校验帧信封并取出类型与品种身份；所有通道都要求 instrumentId。 */
function readFrameEnvelope(raw: unknown): FrameEnvelope {
  if (!raw || typeof raw !== 'object') throw new TypeError('Live frame must be an object')
  const payload = raw as Record<string, unknown>
  const instrumentId = payload.instrumentId
  if (typeof instrumentId !== 'string' || instrumentId === '')
    throw new TypeError('Live frame requires instrumentId')
  return { type: payload.type, instrumentId, payload }
}

/** 解析报价帧；字段缺失直接判为无效帧。 */
function readQuoteFrame(envelope: FrameEnvelope): LiveFrame {
  const { type, instrumentId, payload } = envelope
  if (type !== 'quote') throw new TypeError(`Unknown quote frame: ${String(type)}`)
  const last = readNumber(payload.last)
  const prevClose = readNumber(payload.prevClose)
  const timestamp = readNumber(payload.timestamp)
  if (last === null || prevClose === null || timestamp === null)
    throw new TypeError('Quote frame requires last, prevClose and timestamp')
  return { channel: 'quotes', type: 'quote', instrumentId, quote: { last, prevClose, timestamp } }
}

/** 解析快照帧；任一 K 线无效都视为整帧协议错误。 */
function readSnapshotFrame(instrumentId: string, payload: Record<string, unknown>): LiveFrame {
  if (!Array.isArray(payload.bars)) throw new TypeError('Snapshot frame requires bars')
  const bars: LiveBar[] = []
  for (const rawBar of payload.bars) {
    const bar = readBar(rawBar)
    if (bar === null) throw new TypeError('Snapshot frame has invalid bars')
    bars.push(bar)
  }
  return { channel: 'bars', type: 'snapshot', instrumentId, bars }
}

/** 解析 K 线状态帧；detail 仅在服务端给出字符串时透传。 */
function readStatusFrame(instrumentId: string, payload: Record<string, unknown>): LiveFrame {
  if (typeof payload.status !== 'string') throw new TypeError('Status frame requires status')
  return {
    channel: 'bars',
    type: 'status',
    instrumentId,
    status: payload.status,
    ...(typeof payload.detail === 'string' ? { detail: payload.detail } : {}),
  }
}

/** 是否为携带单根 K 线的更新帧类型。 */
function isBarUpdateType(value: unknown): value is 'update' | 'historical' | 'closed' | 'forming' {
  return typeof value === 'string' && BAR_UPDATE_TYPES.has(value)
}

/** 解析 K 线更新帧；bar 缺失直接判为无效帧。 */
function readBarUpdateFrame(
  type: 'update' | 'historical' | 'closed' | 'forming',
  instrumentId: string,
  payload: Record<string, unknown>,
): LiveFrame {
  const bar = readBar(payload.bar)
  if (bar === null) throw new TypeError(`${type} frame requires a valid bar`)
  return { channel: 'bars', type, instrumentId, bar }
}

/** 解析 K 线帧；按帧类型分派，未知类型视为协议错误。 */
function readBarsFrame(envelope: FrameEnvelope): LiveFrame {
  const { type, instrumentId, payload } = envelope
  if (type === 'snapshot') return readSnapshotFrame(instrumentId, payload)
  if (type === 'invalidate') return { channel: 'bars', type: 'invalidate', instrumentId }
  if (type === 'status') return readStatusFrame(instrumentId, payload)
  if (isBarUpdateType(type)) return readBarUpdateFrame(type, instrumentId, payload)
  throw new TypeError(`Unknown bars frame: ${String(type)}`)
}

/** 把原始载荷解析为通道对应的帧；通道决定帧形状。 */
function readFrame(channel: RealtimeChannel, raw: unknown): LiveFrame {
  const envelope = readFrameEnvelope(raw)
  return channel === 'quotes' ? readQuoteFrame(envelope) : readBarsFrame(envelope)
}

/** 组装批量订阅 URL：品种身份一律用 instrumentId，服务端不再按 symbol 猜测。 */
function buildUrl(request: RealtimeConnectionRequest, baseUrl: string): string {
  if (request.instrumentIds.length === 0)
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      'Live connection requires instruments',
    )
  const params = new URLSearchParams({ instruments: request.instrumentIds.join(',') })
  if (request.channel === 'bars') {
    if (request.period === undefined || request.adjustment === undefined)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'Bars subscription requires period and adjustment',
      )
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
  const hub = createRealtimeCallbackHub()
  let source: LiveEventSource | null = null
  let destroyed = false

  const connection: RealtimeConnection = {
    onFrame: hub.onFrame,
    onStatus: hub.onStatus,
    onError: hub.onError,
    connect() {
      if (destroyed || source !== null) return
      hub.emitStatus('connecting')
      const factory = esFactory ?? ((url: string) => new EventSource(url))
      const current = factory(buildUrl(request, baseUrl))
      source = current
      current.onopen = () => {
        if (source === current) hub.emitStatus('connected')
      }
      current.onerror = () => {
        if (source !== current) return
        // 结束这次传输，阻止浏览器自行重连；恢复时机只由订阅池决定。
        current.close()
        source = null
        hub.emitStatus('disconnected')
      }
      current.onmessage = (event: MessageEvent) => {
        if (source !== current) return
        const data = event.data
        if (typeof data !== 'string' || data === '' || data.startsWith(':')) return
        try {
          hub.emitFrame(readFrame(request.channel, JSON.parse(data) as unknown))
        } catch (error) {
          hub.emitError(
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
      hub.emitStatus('disconnected')
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      source?.close()
      source = null
      hub.close()
    },
  }

  return connection
}
