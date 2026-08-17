/**
 * 协议的 HTTP 实现：封装请求 URL、envelope 解包与错误解析
 * 任意后端只要实现该契约即可复用本 Transport，测试可注入 fetchImpl
 */
import { ERROR_CODES, KLineChartError } from '../../../errors'
import type { KLineChartErrorCode } from '../../../errors'

import { DEFAULT_V1_BASE_URL } from '../sourceRegistry'
export { DEFAULT_V1_BASE_URL } from '../sourceRegistry'

import type {
  MarketDataTransport,
  ProtocolBarRequest,
  ProtocolBarSeries,
  ProtocolEnvelope,
  ProtocolErrorEnvelope,
  ProtocolErrorCode,
  ProtocolInstrumentSearchRequest,
  ProtocolInstrumentSearchResult,
  ProtocolSourceProbe,
  ProtocolTimeShareRangeRequest,
  ProtocolTimeShareRangeSeries,
  ProtocolTimeShareRequest,
  ProtocolTimeShareSeries,
} from './types'
import { V1_SOURCE_REJECTION_CODES } from './types'

// 判定数据后端错误是否触发能力流转
function mapServerErrorCode(code: ProtocolErrorCode): KLineChartErrorCode {
  return (V1_SOURCE_REJECTION_CODES as readonly ProtocolErrorCode[]).includes(code)
    ? (code as KLineChartErrorCode)
    : ERROR_CODES.FETCH_FAILED
}

// 基础地址：静态字符串或惰性解析函数，函数形式支持运行时动态覆盖
export type ProtocolBaseUrl = string | (() => string)

export interface HttpTransportOptions {
  // 基础地址，支持运行时覆盖；未提供时回退默认服务地址
  baseUrl?: ProtocolBaseUrl
  // 注入请求实现，便于测试
  fetchImpl?: typeof fetch
  // 错误消息前缀，默认取协议名；调用方可传数据源名以保留原有诊断信息
  sourceLabel?: string
}

/**
 * 请求指定 endpoint，统一解析成功或错误 envelope
 * @param baseUrl - 基础地址
 * @param path - 接口路径
 * @param init - fetch 请求参数
 * @param getFetch - 惰性获取请求实现，支持运行时替换全局 fetch
 * @param label - 错误消息前缀
 * @returns 解包后的 data 载荷
 */
async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  getFetch: () => typeof fetch,
  label: string,
): Promise<T> {
  // 捕获网络异常与 AbortSignal 中止，统一转换为 KLineChartError 契约
  let res: Response
  try {
    res = await getFetch()(`${baseUrl}${path}`, init)
  } catch (cause) {
    // 网络层异常（断网、DNS 解析失败、请求被中止等），转为标准错误
    throw toFetchError(cause, label)
  }

  // 尝试解析 JSON 响应体，解析失败则返回 undefined
  const body = (await res.json().catch(() => undefined)) as
    ProtocolEnvelope<T> | ProtocolErrorEnvelope | undefined

  // 处理非 2xx 状态码：提取服务端返回的错误信息
  if (!res.ok) {
    // 从错误 envelope 中提取错误消息
    const message =
      body && 'error' in body && typeof body.error?.message === 'string'
        ? body.error.message
        : `[${label}] V1 request failed: ${res.status} ${res.statusText}`
    // 从错误 envelope 中提取错误码
    const serverErrorCode =
      body && 'error' in body && typeof body.error?.code === 'string' ? body.error.code : undefined
    // 抛出标准化错误（有服务端错误码则映射，否则使用通用 FETCH_FAILED）
    throw new KLineChartError(
      serverErrorCode ? mapServerErrorCode(serverErrorCode) : ERROR_CODES.FETCH_FAILED,
      message,
    )
  }

  // 成功响应（2xx）：检查 envelope 是否包含 data 字段
  if (!body || !('data' in body)) {
    // 响应格式不符合协议 Envelope 契约，抛出格式错误
    throw new KLineChartError(ERROR_CODES.FETCH_FAILED, `[${label}] invalid V1 response envelope`)
  }

  return body.data
}

// 把 fetch 原生异常（网络 TypeError、AbortError 等）转为协议错误
// 中止保留独立错误码，调用方可区分主动取消与真实失败
function toFetchError(cause: unknown, label: string): KLineChartError {
  const aborted = cause instanceof Error && cause.name === 'AbortError'
  const detail = cause instanceof Error ? cause.message : String(cause)
  return new KLineChartError(
    aborted ? ERROR_CODES.FETCH_ABORTED : ERROR_CODES.FETCH_FAILED,
    aborted ? `[${label}] request aborted` : `[${label}] network error: ${detail}`,
    { cause },
  )
}

// 创建基于 HTTP 的 Transport 实例
export function createHttpMarketDataV1Transport(
  options: HttpTransportOptions = {},
): MarketDataTransport {
  // 惰性解析：每次请求动态读取，支持 vi.stubGlobal 等运行时替换
  const getFetch = (): typeof fetch => options.fetchImpl ?? fetch
  const label = options.sourceLabel ?? 'v1'
  const baseUrl = (): string => {
    const url = options.baseUrl
    return typeof url === 'function' ? url() : (url ?? DEFAULT_V1_BASE_URL)
  }

  return {
    // 通过 probe endpoint 探测数据源可用性
    async probe(sourceId, signal) {
      const path = `/api/v1/market-data/sources/${encodeURIComponent(sourceId)}/probe`
      return request<ProtocolSourceProbe>(baseUrl(), path, { method: 'GET', signal }, getFetch, label)
    },

    // 通过 instruments/search endpoint 搜索标准品种目录
    async searchInstruments(req, signal) {
      const body = JSON.stringify({
        sourceId: req.sourceId,
        keyword: req.keyword,
        limit: req.limit,
        assetClasses: req.assetClasses,
      })
      return request<ProtocolInstrumentSearchResult>(
        baseUrl(),
        '/api/v1/market-data/instruments/search',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal },
        getFetch,
        label,
      )
    },

    // 通过 bars endpoint 拉取标准 K 线
    async fetchBars(req, signal) {
      const body = JSON.stringify({
        sourceId: req.sourceId,
        instrument: req.instrument,
        period: req.period,
        adjustment: req.adjustment,
        limit: req.limit,
        ...(req.before === undefined ? {} : { before: req.before }),
      })
      return request<ProtocolBarSeries>(
        baseUrl(),
        '/api/v1/market-data/bars',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal },
        getFetch,
        label,
      )
    },

    // 通过 timeshare endpoint 拉取标准分时
    async fetchTimeShare(req, signal) {
      const body = JSON.stringify({
        sourceId: req.sourceId,
        instrument: req.instrument,
        tradingDate: req.tradingDate,
      })
      return request<ProtocolTimeShareSeries>(
        baseUrl(),
        '/api/v1/market-data/timeshare',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal },
        getFetch,
        label,
      )
    },

    // 通过 timeshare/range endpoint 拉取多个实际交易日的分时
    async fetchTimeShareRange(req: ProtocolTimeShareRangeRequest, signal) {
      const body = JSON.stringify({
        sourceId: req.sourceId,
        instrument: req.instrument,
        endTradingDate: req.endTradingDate,
        days: req.days,
      })
      return request<ProtocolTimeShareRangeSeries>(
        baseUrl(),
        '/api/v1/market-data/timeshare/range',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal },
        getFetch,
        label,
      )
    },
  }
}
