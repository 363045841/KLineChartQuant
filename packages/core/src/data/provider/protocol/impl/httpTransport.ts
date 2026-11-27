/**
 * 协议的 HTTP 实现：组装请求 URL、校验 envelope、映射后端错误。
 *
 * 只实现协议约定的 HTTP 语义；`fetch` 与地址都由宿主的 Provider 装配注入。
 */

import type { KLineChartErrorCode } from '@/errors.js'
import { ERROR_CODES, KLineChartError } from '@/errors.js'

import type {
  MarketDataTransport,
  ProtocolBarRequest,
  ProtocolBarSeries,
  ProtocolEnvelope,
  ProtocolErrorCode,
  ProtocolErrorEnvelope,
  ProtocolInstrumentSearchRequest,
  ProtocolInstrumentSearchResult,
  ProtocolSourceProbe,
  ProtocolTimeShareRangeRequest,
  ProtocolTimeShareRangeSeries,
  ProtocolTimeShareRequest,
  ProtocolTimeShareSeries,
  ProtocolTradingCalendar,
  ProtocolTradingCalendarRequest,
} from '../types.js'
import { SOURCE_REJECTION_CODES, V1_ENDPOINTS } from '../types.js'

export { DEFAULT_V1_BASE_URL } from '../../impl/sourceRegistry.js'

// 统一 JSON 请求头；wire 层共用，不重复声明。
const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

/** 数据源地址；支持静态字符串或在请求时求值。 */
export type ProtocolBaseUrl = string | (() => string)

export interface HttpTransportOptions {
  /** 数据源生效地址；由 Provider 装配提供，不做默认回退。 */
  readonly baseUrl: ProtocolBaseUrl
  /** 宿主 fetch；由 Provider 装配提供，不做全局回退。 */
  readonly fetchImpl: typeof fetch
  /** 错误信息前缀；默认取协议名，宿主可传数据源 id。 */
  readonly sourceLabel?: string
}

/** 后端拒绝码到统一错误码的映射；未声明的一律视为取数失败。 */
function mapServerErrorCode(code: ProtocolErrorCode): KLineChartErrorCode {
  return (SOURCE_REJECTION_CODES as readonly ProtocolErrorCode[]).includes(code)
    ? (code as KLineChartErrorCode)
    : ERROR_CODES.FETCH_FAILED
}

/** 把 fetch 原始异常（TypeError、AbortError 等）转为协议错误。 */
function toFetchError(cause: unknown, label: string): KLineChartError {
  const aborted = cause instanceof Error && cause.name === 'AbortError'
  const detail = cause instanceof Error ? cause.message : String(cause)
  return new KLineChartError(
    aborted ? ERROR_CODES.FETCH_ABORTED : ERROR_CODES.FETCH_FAILED,
    aborted ? `[${label}] request aborted` : `[${label}] network error: ${detail}`,
    { cause },
  )
}

/**
 * 请求指定 endpoint，并统一处理成功与失败 envelope。
 *
 * @param baseUrl - 数据源地址
 * @param path - 接口路径
 * @param init - fetch 初始化参数
 * @param fetchImpl - 宿主 fetch
 * @param label - 错误信息前缀
 * @returns envelope 中的 data
 */
async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  label: string,
): Promise<T> {
  let res: Response
  try {
    res = await fetchImpl(`${baseUrl}${path}`, init)
  } catch (cause) {
    // 连接被拒、DNS 失败、主动中止都统一转为标准错误。
    throw toFetchError(cause, label)
  }

  let body: unknown
  try {
    body = await res.json()
  } catch (cause) {
    if (init.signal?.aborted || (cause instanceof Error && cause.name === 'AbortError')) {
      throw toFetchError(init.signal?.aborted ? init.signal.reason : cause, label)
    }
    const message = res.ok
      ? `[${label}] invalid V1 response envelope`
      : `[${label}] V1 request failed: ${res.status} ${res.statusText}`
    throw new KLineChartError(ERROR_CODES.FETCH_FAILED, message, { cause })
  }
  const envelope = body !== null && typeof body === 'object' ? body : undefined

  if (!res.ok) {
    const responseError = (envelope as ProtocolErrorEnvelope | undefined)?.error
    const message =
      typeof responseError?.message === 'string'
        ? responseError.message
        : `[${label}] V1 request failed: ${res.status} ${res.statusText}`
    const serverErrorCode =
      typeof responseError?.code === 'string' ? responseError.code : undefined
    throw new KLineChartError(
      serverErrorCode ? mapServerErrorCode(serverErrorCode) : ERROR_CODES.FETCH_FAILED,
      message,
    )
  }

  if (!envelope || !('data' in envelope)) {
    throw new KLineChartError(ERROR_CODES.FETCH_FAILED, `[${label}] invalid V1 response envelope`)
  }

  return (envelope as ProtocolEnvelope<T>).data
}

/**
 * 创建协议 HTTP 传输。
 *
 * @param options - 地址、宿主 fetch 与错误前缀
 * @returns 协议传输实现
 */
export function createHttpMarketDataTransport(options: HttpTransportOptions): MarketDataTransport {
  const { fetchImpl } = options
  const label = options.sourceLabel ?? 'v1'
  const baseUrl = (): string => {
    const url = options.baseUrl
    return typeof url === 'function' ? url() : url
  }

  return {
    /** 成交时间范围；K 线共享同一份 envelope 与错误处理。 */
    async fetchTradeRange(req, signal) {
      return request<import('../../../trades/types.js').TradeBatch>(
        baseUrl(),
        V1_ENDPOINTS.tradesRange,
        { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(req), signal },
        fetchImpl,
        label,
      )
    },
    async probe(sourceId, signal) {
      const path = `${V1_ENDPOINTS.sources}/${encodeURIComponent(sourceId)}/probe`
      return request<ProtocolSourceProbe>(baseUrl(), path, { method: 'GET', signal }, fetchImpl, label)
    },

    async searchInstruments(req, signal) {
      const body = JSON.stringify({
        sourceId: req.sourceId,
        keyword: req.keyword,
        limit: req.limit,
        instrumentTypes: req.instrumentTypes,
      })
      return request<ProtocolInstrumentSearchResult>(
        baseUrl(),
        V1_ENDPOINTS.instrumentsSearch,
        { method: 'POST', headers: JSON_HEADERS, body, signal },
        fetchImpl,
        label,
      )
    },

    async fetchBars(req, signal) {
      const body = JSON.stringify({
        sourceId: req.sourceId,
        instrument: req.instrument,
        period: req.period,
        adjustment: req.adjustment,
        barAggregation: req.barAggregation,
        limit: req.limit,
        ...(req.beforeTimestamp === undefined ? {} : { beforeTimestamp: req.beforeTimestamp }),
      })
      return request<ProtocolBarSeries>(
        baseUrl(),
        V1_ENDPOINTS.bars,
        { method: 'POST', headers: JSON_HEADERS, body, signal },
        fetchImpl,
        label,
      )
    },

    async fetchTradingCalendar(req: ProtocolTradingCalendarRequest, signal) {
      return request<ProtocolTradingCalendar>(
        baseUrl(),
        V1_ENDPOINTS.tradingCalendar,
        {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(req),
          signal,
        },
        fetchImpl,
        label,
      )
    },

    async fetchTimeShare(req, signal) {
      const body = JSON.stringify({
        sourceId: req.sourceId,
        instrument: req.instrument,
        tradingDate: req.tradingDate,
      })
      return request<ProtocolTimeShareSeries>(
        baseUrl(),
        V1_ENDPOINTS.timeShare,
        { method: 'POST', headers: JSON_HEADERS, body, signal },
        fetchImpl,
        label,
      )
    },

    async fetchTimeShareRange(req: ProtocolTimeShareRangeRequest, signal) {
      const body = JSON.stringify({
        sourceId: req.sourceId,
        instrument: req.instrument,
        endTradingDate: req.endTradingDate,
        days: req.days,
      })
      return request<ProtocolTimeShareRangeSeries>(
        baseUrl(),
        V1_ENDPOINTS.timeShareRange,
        { method: 'POST', headers: JSON_HEADERS, body, signal },
        fetchImpl,
        label,
      )
    },
  }
}
