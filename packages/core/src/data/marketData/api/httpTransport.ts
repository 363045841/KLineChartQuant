/**
 * 行情协议的 HTTP 实现：封装请求 URL、envelope 解包与错误解析
 * 任意后端只要实现该契约即可复用本 Transport，测试可注入 fetchImpl
 */
import { KLineChartError } from '../../../errors'

import type {
  MarketDataV1Transport,
  V1BarRequest,
  V1BarSeries,
  V1Envelope,
  V1ErrorEnvelope,
  V1InstrumentSearchRequest,
  V1InstrumentSearchResult,
  V1SourceProbe,
  V1TimeShareRequest,
  V1TimeShareSeries,
} from './types'

// 本地默认服务地址，可通过 baseUrl 覆盖
export const DEFAULT_V1_BASE_URL = 'http://127.0.0.1:8080'

// 基础地址：静态字符串或惰性解析函数，函数形式支持运行时动态覆盖
export type V1BaseUrl = string | (() => string)

export interface V1HttpTransportOptions {
  // 基础地址，支持运行时覆盖；未提供时回退默认服务地址
  baseUrl?: V1BaseUrl
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
  const res = await getFetch()(`${baseUrl}${path}`, init)
  const body = (await res.json().catch(() => undefined)) as
    V1Envelope<T> | V1ErrorEnvelope | undefined
  if (!res.ok) {
    const message =
      body && 'error' in body && typeof body.error?.message === 'string'
        ? body.error.message
        : `[${label}] V1 request failed: ${res.status} ${res.statusText}`
    throw new KLineChartError('FETCH_FAILED', message)
  }
  if (!body || !('data' in body)) {
    throw new KLineChartError('FETCH_FAILED', `[${label}] invalid V1 response envelope`)
  }
  return body.data
}

// 创建基于 HTTP 的 Transport 实例
export function createHttpMarketDataV1Transport(
  options: V1HttpTransportOptions = {},
): MarketDataV1Transport {
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
      return request<V1SourceProbe>(baseUrl(), path, { method: 'GET', signal }, getFetch, label)
    },

    // 通过 instruments/search endpoint 搜索标准品种目录
    async searchInstruments(req, signal) {
      const body = JSON.stringify({
        sourceId: req.sourceId,
        keyword: req.keyword,
        limit: req.limit,
        assetClasses: req.assetClasses,
      })
      return request<V1InstrumentSearchResult>(
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
        from: req.from,
        to: req.to,
      })
      return request<V1BarSeries>(
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
      return request<V1TimeShareSeries>(
        baseUrl(),
        '/api/v1/market-data/timeshare',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal },
        getFetch,
        label,
      )
    },
  }
}
