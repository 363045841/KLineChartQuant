/**
 * 五家交易所的深度适配器。
 *
 * 各家的响应形状、数量单位、端点参数都不一样，统一在这里收敛成 `DepthSnapshot`：
 *
 * | 交易所 | 端点 | 数量单位 | 备注 |
 * | --- | --- | --- | --- |
 * | Binance | `GET /fapi/v1/depth?limit=1000` | 基础币 | 覆盖约 ±0.17%，最窄 |
 * | OKX | `GET /api/v5/market/books?sz=400` | **张数** | 需乘 `ctVal`，BTC 一张 = 0.01 |
 * | Bybit | `GET /v5/market/orderbook?limit=200` | 基础币 | 覆盖约 ±0.5% |
 * | Bitget | `GET /api/v2/mix/market/merge-depth` | 基础币 | 带 `limit` 参数反而返回空买盘 |
 * | Hyperliquid | `POST /info {"type":"l2Book"}` | 基础币 | 只返回前 20 档 |
 *
 * 单位与覆盖范围的实测记录见 docs/design/data/orderflow-panel.md。
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'
import type { HttpClient, ProxyEndpoint } from '../../net/types'
import type { DepthLevel, DepthSnapshot, OrderflowVenue } from '../types'
import { buildDepthSnapshot } from './depth'
import { notionalOf, toBaseSize } from './units'

/** 单次请求超时。 */
export const DEFAULT_DEPTH_TIMEOUT_MS = 15_000

/** 各所端点基址。 */
const ENDPOINTS = {
  binance: 'https://fapi.binance.com/fapi/v1/depth',
  okx: 'https://www.okx.com/api/v5/market/books',
  okxInstruments: 'https://www.okx.com/api/v5/public/instruments',
  bybit: 'https://api.bybit.com/v5/market/orderbook',
  bitget: 'https://api.bitget.com/api/v2/mix/market/merge-depth',
  hyperliquid: 'https://api.hyperliquid.xyz/info',
} as const

/** 各所请求的档数上限。 */
const DEPTH_LIMITS = {
  binance: 1000,
  okx: 400,
  bybit: 200,
} as const

/**
 * 把统一交易对标识映射成各所的合约 ID。
 *
 * @param venue 交易所
 * @param symbol 统一标识，例如 `BTCUSDT`
 * @returns 该所合约 ID
 * @throws AnalyticsError 该所使用不支持的标识格式
 */
export function instrumentIdFor(venue: OrderflowVenue, symbol: string): string {
  const match = /^([A-Z]+)USDT$/.exec(symbol)
  if (match === null) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
      `不支持的交易对标识：${symbol}（应为 BTCUSDT 这类格式）`,
      { symbol },
    )
  }
  const base = match[1]
  switch (venue) {
    case 'binance':
    case 'bybit':
    case 'bitget':
      return symbol
    case 'okx':
      return `${base}-USDT-SWAP`
    case 'hyperliquid':
      return base
  }
}

/**
 * 判断值是否为对象。
 *
 * @param value 任意值
 * @returns 是否普通对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 解析 JSON 响应体。
 *
 * @param body 响应文本
 * @param url 请求地址（错误上下文）
 * @returns 解析结果
 * @throws AnalyticsError 不是合法 JSON
 */
function parseJson(body: string, url: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.RESPONSE_INVALID_JSON,
      `响应不是合法 JSON：${url}`,
      { url, excerpt: body.slice(0, 200) },
    )
  }
}

/**
 * 从「[价格, 数量]」数组构造档位。
 *
 * @param rows 原始数组
 * @param contractValue 一张合约对应的基础币数量（币数计价传 1）
 * @param label 数据来源标签（错误上下文）
 * @returns 已归一化的档位
 * @throws AnalyticsError 行格式非法
 */
function toLevels(rows: unknown, contractValue: number, label: string): DepthLevel[] {
  if (!Array.isArray(rows)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
      `${label} 的档位不是数组`,
      { label },
    )
  }
  const levels: DepthLevel[] = []
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue
    const price = Number(row[0])
    const rawSize = Number(row[1])
    if (!Number.isFinite(price) || !Number.isFinite(rawSize)) continue
    const size = toBaseSize(rawSize, contractValue)
    levels.push({ price, size, notional: notionalOf(size, price) })
  }
  return levels
}

/** 深度客户端构造参数。 */
export interface DepthClientOptions {
  /** HTTP 客户端 */
  readonly httpClient: HttpClient
  /** 代理端点；null 表示直连 */
  readonly proxy: ProxyEndpoint | null
  /** 超时毫秒 */
  readonly timeoutMs?: number
}

/** 深度采集接口。 */
export interface DepthClient {
  /**
   * 采集一个交易所在一个交易对上的深度快照。
   *
   * @param venue 交易所
   * @param symbol 统一交易对标识
   * @returns 深度快照
   */
  readonly fetch: (venue: OrderflowVenue, symbol: string) => Promise<DepthSnapshot>
}

/**
 * 创建深度采集客户端。
 *
 * OKX 的合约面值在进程内缓存：它属于交易所低频调整的参数，每个采集轮次重复请求
 * 纯属浪费配额；缓存失效的场景（交易所在运行期改面值）概率极低且可由重启恢复。
 *
 * @param options HTTP 客户端、代理与超时
 * @returns 深度采集接口
 */
export function createDepthClient(options: DepthClientOptions): DepthClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DEPTH_TIMEOUT_MS
  const contractValueCache = new Map<string, number>()

  /**
   * 读取 OKX 合约面值。
   *
   * @param instrumentId 合约 ID，例如 `BTC-USDT-SWAP`
   * @returns 一张合约对应的基础币数量
   */
  async function okxContractValue(instrumentId: string): Promise<number> {
    const cached = contractValueCache.get(instrumentId)
    if (cached !== undefined) return cached
    const url = `${ENDPOINTS.okxInstruments}?instType=SWAP&instId=${encodeURIComponent(instrumentId)}`
    const response = await options.httpClient.getText({
      url,
      timeoutMs,
      proxy: options.proxy,
    })
    const payload = parseJson(response.body, url)
    if (!isRecord(payload) || !Array.isArray(payload.data) || payload.data.length === 0) {
      throw new AnalyticsError(
        ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
        `OKX 合约元数据为空：${instrumentId}`,
        { instrumentId },
      )
    }
    const first = payload.data[0]
    const value = isRecord(first) ? Number(first.ctVal) : Number.NaN
    if (!Number.isFinite(value) || value <= 0) {
      throw new AnalyticsError(
        ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
        `OKX 合约面值非法：${instrumentId}=${String(isRecord(first) ? first.ctVal : undefined)}`,
        { instrumentId },
      )
    }
    contractValueCache.set(instrumentId, value)
    return value
  }

  return {
    async fetch(venue: OrderflowVenue, symbol: string): Promise<DepthSnapshot> {
      const instrumentId = instrumentIdFor(venue, symbol)

      if (venue === 'hyperliquid') {
        const url = ENDPOINTS.hyperliquid
        const response = await options.httpClient.postJson({
          url,
          timeoutMs,
          proxy: options.proxy,
          body: JSON.stringify({ type: 'l2Book', coin: instrumentId }),
        })
        const payload = parseJson(response.body, url)
        if (!isRecord(payload) || !Array.isArray(payload.levels) || payload.levels.length < 2) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `Hyperliquid 深度结构不符：${instrumentId}`,
            { instrumentId },
          )
        }
        const toRows = (side: unknown): unknown[] => {
          if (!Array.isArray(side)) return []
          return side.map((item) => (isRecord(item) ? [item.px, item.sz] : null))
        }
        return buildDepthSnapshot({
          venue,
          symbol,
          timestamp: Date.now(),
          bids: toLevels(toRows(payload.levels[0]), 1, `hyperliquid ${symbol} 买盘`),
          asks: toLevels(toRows(payload.levels[1]), 1, `hyperliquid ${symbol} 卖盘`),
        })
      }

      if (venue === 'okx') {
        const contractValue = await okxContractValue(instrumentId)
        const url = `${ENDPOINTS.okx}?instId=${encodeURIComponent(instrumentId)}&sz=${DEPTH_LIMITS.okx}`
        const response = await options.httpClient.getText({ url, timeoutMs, proxy: options.proxy })
        const payload = parseJson(response.body, url)
        if (!isRecord(payload) || !Array.isArray(payload.data) || payload.data.length === 0) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `OKX 深度结构不符：${instrumentId}`,
            { instrumentId },
          )
        }
        const book = payload.data[0]
        if (!isRecord(book)) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `OKX 深度缺少盘口字段：${instrumentId}`,
            { instrumentId },
          )
        }
        return buildDepthSnapshot({
          venue,
          symbol,
          timestamp: Date.now(),
          bids: toLevels(book.bids, contractValue, `okx ${symbol} 买盘`),
          asks: toLevels(book.asks, contractValue, `okx ${symbol} 卖盘`),
        })
      }

      if (venue === 'bybit') {
        const url = `${ENDPOINTS.bybit}?category=linear&symbol=${encodeURIComponent(instrumentId)}&limit=${DEPTH_LIMITS.bybit}`
        const response = await options.httpClient.getText({ url, timeoutMs, proxy: options.proxy })
        const payload = parseJson(response.body, url)
        const result = isRecord(payload) ? payload.result : undefined
        if (!isRecord(result)) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `Bybit 深度结构不符：${instrumentId}`,
            { instrumentId },
          )
        }
        return buildDepthSnapshot({
          venue,
          symbol,
          timestamp: Date.now(),
          bids: toLevels(result.b, 1, `bybit ${symbol} 买盘`),
          asks: toLevels(result.a, 1, `bybit ${symbol} 卖盘`),
        })
      }

      if (venue === 'bitget') {
        // 带 limit 参数时 Bitget 会返回空买盘（实测），因此不传 limit。
        const url = `${ENDPOINTS.bitget}?productType=USDT-FUTURES&symbol=${encodeURIComponent(instrumentId)}`
        const response = await options.httpClient.getText({ url, timeoutMs, proxy: options.proxy })
        const payload = parseJson(response.body, url)
        const data = isRecord(payload) ? payload.data : undefined
        if (!isRecord(data)) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `Bitget 深度结构不符：${instrumentId}`,
            { instrumentId },
          )
        }
        return buildDepthSnapshot({
          venue,
          symbol,
          timestamp: Date.now(),
          bids: toLevels(data.bids, 1, `bitget ${symbol} 买盘`),
          asks: toLevels(data.asks, 1, `bitget ${symbol} 卖盘`),
        })
      }

      const url = `${ENDPOINTS.binance}?symbol=${encodeURIComponent(instrumentId)}&limit=${DEPTH_LIMITS.binance}`
      const response = await options.httpClient.getText({ url, timeoutMs, proxy: options.proxy })
      const payload = parseJson(response.body, url)
      if (!isRecord(payload)) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
          `Binance 深度结构不符：${instrumentId}`,
          { instrumentId },
        )
      }
      return buildDepthSnapshot({
        venue,
        symbol,
        timestamp: Date.now(),
        bids: toLevels(payload.bids, 1, `binance ${symbol} 买盘`),
        asks: toLevels(payload.asks, 1, `binance ${symbol} 卖盘`),
      })
    },
  }
}
