/** V1.1 流协议：URL 组装与帧解析。任何不符合契约的帧都视为协议错误，不做猜测。 */

import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { BarAggregation, KLineAdjustment, KLinePeriod } from '../../provider/types.js'
import { V1_ENDPOINTS } from '../../provider/protocol/types.js'
import type {
  StreamBar,
  StreamChannel,
  StreamErrorCode,
  StreamFrame,
  StreamRequest,
  StreamStatus,
  StreamSubscriptionRequest,
} from '../types.js'
import { STREAM_ERROR_CODES, STREAM_STATUS } from '../types.js'

/** bars 通道的序列参数；成组出现。 */
interface StreamSerial {
  period: KLinePeriod
  adjustment: KLineAdjustment
  barAggregation: BarAggregation
}

/** 通道对应的端点路径段；两个通道都挂在 sources/:source 下。 */
const CHANNEL_PATHS = {
  bars: 'stream',
  quotes: 'quotes',
} as const satisfies Record<StreamChannel, string>

/** 状态词表是封闭集合；未知字符串直接拒绝。 */
const STATUSES = new Set<string>(Object.values(STREAM_STATUS))

/** 读取有限数字；缺失或类型不符返回 null。 */
function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 读取非负安全整数；用于序号、时间戳与快照条数。 */
function readCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

/** 读取非空字符串。 */
function readString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** 读取一根 K 线；字段缺失直接判为无效。 */
function readBar(value: unknown): StreamBar {
  if (!value || typeof value !== 'object') throw new TypeError('Bar must be an object')
  const raw = value as Record<string, unknown>
  const timestamp = readNumber(raw.timestamp)
  const open = readNumber(raw.open)
  const high = readNumber(raw.high)
  const low = readNumber(raw.low)
  const close = readNumber(raw.close)
  if (timestamp === null || open === null || high === null || low === null || close === null)
    throw new TypeError('Bar requires timestamp, open, high, low and close')
  const volume = raw.volume === undefined ? null : readNumber(raw.volume)
  const turnover = raw.turnover === undefined ? null : readNumber(raw.turnover)
  if (raw.volume !== undefined && volume === null) throw new TypeError('Bar volume must be finite')
  if (raw.turnover !== undefined && turnover === null)
    throw new TypeError('Bar turnover must be finite')
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

/** 读取帧信封；序号与服务端时间必须存在。 */
function readEnvelope(raw: Record<string, unknown>): { seq: number; ts: number } {
  const seq = readCount(raw.seq)
  const ts = readCount(raw.ts)
  if (seq === null || ts === null) throw new TypeError('Frame requires seq and ts')
  return { seq, ts }
}

/**
 * 解析一帧；帧类型决定必需字段。
 *
 * @param value - `data:` 解析后的原始载荷
 * @returns 通过校验的强类型帧
 * @throws 字段缺失、类型不符或未知帧类型
 */
export function parseStreamFrame(value: unknown): StreamFrame {
  if (!value || typeof value !== 'object') throw new TypeError('Frame must be an object')
  const raw = value as Record<string, unknown>
  const envelope = readEnvelope(raw)
  const type = readString(raw.type)

  switch (type) {
    case 'hello': {
      const instruments = raw.instruments
      if (!Array.isArray(instruments) || instruments.some((id) => readString(id) === null))
        throw new TypeError('hello requires instruments')
      const snapshotSize = readCount(raw.snapshotSize)
      if (snapshotSize === null) throw new TypeError('hello requires snapshotSize')
      return {
        ...envelope,
        type,
        instruments: instruments as ReadonlyArray<string>,
        snapshotSize,
        ...readSerial(raw),
      }
    }
    case 'snapshot': {
      const instrumentId = readString(raw.instrumentId)
      if (instrumentId === null) throw new TypeError('snapshot requires instrumentId')
      if (!Array.isArray(raw.bars)) throw new TypeError('snapshot requires bars')
      return { ...envelope, type, instrumentId, bars: raw.bars.map(readBar) }
    }
    case 'bar': {
      const instrumentId = readString(raw.instrumentId)
      const state = raw.state
      if (instrumentId === null) throw new TypeError('bar requires instrumentId')
      if (state !== 'forming' && state !== 'closed') throw new TypeError('bar requires state')
      return { ...envelope, type, instrumentId, state, bar: readBar(raw.bar) }
    }
    case 'quote': {
      const instrumentId = readString(raw.instrumentId)
      if (instrumentId === null) throw new TypeError('quote requires instrumentId')
      if (!raw.quote || typeof raw.quote !== 'object') throw new TypeError('quote requires quote')
      const quote = raw.quote as Record<string, unknown>
      const last = readNumber(quote.last)
      const prevClose = readNumber(quote.prevClose)
      const timestamp = readCount(quote.timestamp)
      if (last === null || prevClose === null || timestamp === null)
        throw new TypeError('quote requires last, prevClose and timestamp')
      return { ...envelope, type, instrumentId, quote: { last, prevClose, timestamp } }
    }
    case 'status': {
      const instrumentId = readString(raw.instrumentId)
      const status = readString(raw.status)
      if (instrumentId === null) throw new TypeError('status requires instrumentId')
      if (status === null || !STATUSES.has(status)) throw new TypeError('Unknown stream status')
      return {
        ...envelope,
        type,
        instrumentId,
        status: status as StreamStatus,
        ...(typeof raw.detail === 'string' ? { detail: raw.detail } : {}),
      }
    }
    case 'ping':
      return { ...envelope, type }
    case 'error': {
      const code = readString(raw.code)
      const message = readString(raw.message)
      const retryable = raw.retryable
      if (code === null || !Object.values(STREAM_ERROR_CODES).includes(code as never))
        throw new TypeError('Unknown stream error code')
      if (message === null || typeof retryable !== 'boolean')
        throw new TypeError('error requires message and retryable')
      return {
        ...envelope,
        type,
        code: code as StreamErrorCode,
        message,
        retryable,
        ...(typeof raw.instrumentId === 'string' ? { instrumentId: raw.instrumentId } : {}),
      }
    }
    default:
      throw new TypeError(`Unknown stream frame: ${String(type)}`)
  }
}

/** 序列参数只在 bars 通道出现；缺项保持 undefined，由订阅校验负责拒绝。 */
function readSerial(raw: Record<string, unknown>): Partial<StreamSerial> {
  const serial: Partial<StreamSerial> = {}
  const period = readString(raw.period)
  const adjustment = readString(raw.adjustment)
  const barAggregation = readString(raw.barAggregation)
  if (period !== null) serial.period = period as KLinePeriod
  if (adjustment !== null) serial.adjustment = adjustment as KLineAdjustment
  if (barAggregation !== null) serial.barAggregation = barAggregation as BarAggregation
  return serial
}

/**
 * 组装批量订阅 URL；品种身份一律用 instrumentId。
 *
 * @param request - 订阅集合与序列参数
 * @param baseUrl - 数据源生效地址
 * @returns 完整的 SSE 地址
 * @throws 缺少品种或 bars 通道缺少序列参数
 */
export function buildStreamUrl(request: StreamRequest, baseUrl: string): string {
  if (request.instrumentIds.length === 0)
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      'Stream connection requires instruments',
    )
  const params = new URLSearchParams({ instruments: request.instrumentIds.join(',') })
  if (request.channel === 'bars') {
    if (request.period === undefined || request.adjustment === undefined)
      throw new KLineChartError(
        GENERIC_ERROR_CODES.INVALID_PARAM,
        'Bars stream requires period and adjustment',
      )
    params.set('period', request.period)
    params.set('adjustment', request.adjustment)
    if (request.barAggregation !== undefined) params.set('barAggregation', request.barAggregation)
  }
  const source = encodeURIComponent(request.source)
  return `${baseUrl}${V1_ENDPOINTS.sources}/${source}/${CHANNEL_PATHS[request.channel]}?${params.toString()}`
}

/**
 * 校验订阅身份：K 线必须带齐序列参数，报价忽略序列参数。
 *
 * @param request - 逻辑订阅
 * @throws 身份或序列参数不完整
 */
export function assertSubscription(request: StreamSubscriptionRequest): void {
  if (!request.source || !request.instrumentId)
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      'Stream subscription requires source and instrumentId',
    )
  if (request.channel === 'quotes') return
  if (
    request.period === undefined ||
    request.adjustment === undefined ||
    request.barAggregation === undefined
  )
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      'Bars subscription requires period, adjustment and barAggregation',
    )
}
