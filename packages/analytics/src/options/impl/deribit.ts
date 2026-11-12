/**
 * Deribit 公开 REST 客户端。
 *
 * 只用两个端点：
 * - `public/get_book_summary_by_currency?currency=BTC|ETH&kind=option`：一次拿全链（BTC 876 张 / ETH 746 张）
 * - `public/get_index_price?index_name=btc_usd|eth_usd`：现货指数，用于 ±1σ 与 GEX 的美元口径
 *
 * 全链快照不含 `greeks` 字段，gamma 由本地 Black-76 反算，这里不做任何 greeks 取值。
 * 本机直连 Deribit 会超时后 ECONNRESET，所以代理端点由调用方显式传入。
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'
import type { HttpClient, ProxyEndpoint } from '../../net/types'
import type {
  DeribitClient,
  DeribitIndexPrice,
  DeribitOptionChain,
  OptionContract,
  OptionCurrency,
} from '../types'
import { parseInstrumentName } from './instrument'

/** Deribit REST 基址。 */
export const DERIBIT_API_BASE = 'https://www.deribit.com/api/v2'

/** 默认超时：全链中位 0.5 秒、冷启动 1.8 秒，15 秒足够暴露网络问题。 */
export const DEFAULT_DERIBIT_TIMEOUT_MS = 15_000

/** 标的 → Deribit 指数名。 */
const INDEX_NAME_BY_CURRENCY: Readonly<Record<OptionCurrency, string>> = {
  BTC: 'btc_usd',
  ETH: 'eth_usd',
}

/** 客户端构造参数。 */
export interface DeribitClientOptions {
  /** HTTP 客户端（真实实现或测试替身） */
  readonly httpClient: HttpClient
  /** 代理端点；Deribit 在本机必须走代理 */
  readonly proxy: ProxyEndpoint | null
  /** 单次请求超时，默认 15 秒 */
  readonly timeoutMs?: number
}

/**
 * 判断值是否为普通对象。
 *
 * @param value 任意值
 * @returns 是否对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 解析 JSON 响应体。
 *
 * @param body 响应文本
 * @param url 请求 URL（用于错误上下文）
 * @returns 解析后的任意值
 * @throws AnalyticsError 不是合法 JSON
 */
function parseJsonBody(body: string, url: string): unknown {
  try {
    return JSON.parse(body)
  } catch (error) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.RESPONSE_INVALID_JSON,
      `响应不是合法 JSON：${url}`,
      { url, excerpt: body.slice(0, 200) },
    )
  }
}

/**
 * 读取必填数字字段。
 *
 * @param record 响应对象
 * @param key 字段名
 * @param context 错误上下文（合约名或端点）
 * @returns 有限数字
 * @throws AnalyticsError 字段缺失或不是数字
 */
function readFiniteNumber(record: Record<string, unknown>, key: string, context: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
      `${context} 的 ${key} 不是有限数字`,
      { context, key, valueType: typeof value },
    )
  }
  return value
}

/**
 * 读取必填字符串字段。
 *
 * @param record 响应对象
 * @param key 字段名
 * @param context 错误上下文
 * @returns 字符串
 * @throws AnalyticsError 字段缺失或不是字符串
 */
function readText(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value === '') {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
      `${context} 的 ${key} 不是非空字符串`,
      { context, key, valueType: typeof value },
    )
  }
  return value
}

/**
 * 把一条 `book_summary` 记录转换成合约对象。
 *
 * @param raw 原始记录
 * @param expectedCurrency 请求的标的
 * @returns 合约对象
 * @throws AnalyticsError 字段缺失、类型不符或合约名与标的矛盾
 */
function toOptionContract(
  raw: Record<string, unknown>,
  expectedCurrency: OptionCurrency,
): OptionContract {
  const instrumentName = readText(raw, 'instrument_name', 'book_summary')
  const parsed = parseInstrumentName(instrumentName)
  if (parsed.currency !== expectedCurrency) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
      `合约标的与请求不符：${instrumentName}`,
      { instrumentName, expectedCurrency, actualCurrency: parsed.currency },
    )
  }

  return {
    instrumentName,
    currency: parsed.currency,
    expiryIso: parsed.expiryIso,
    expiryMs: parsed.expiryMs,
    strike: parsed.strike,
    optionType: parsed.optionType,
    openInterest: readFiniteNumber(raw, 'open_interest', instrumentName),
    markIvPercent: readFiniteNumber(raw, 'mark_iv', instrumentName),
    markPrice: readFiniteNumber(raw, 'mark_price', instrumentName),
    underlyingPrice: readFiniteNumber(raw, 'underlying_price', instrumentName),
    creationTimestamp: readFiniteNumber(raw, 'creation_timestamp', instrumentName),
  }
}

/**
 * 从响应对象里取出 `result`，并把数据源返回的业务错误转成明确异常。
 *
 * @param payload 解析后的响应
 * @param url 请求 URL
 * @returns result 字段
 * @throws AnalyticsError 数据源返回 error 或缺少 result
 */
function readResult(payload: unknown, url: string): unknown {
  if (!isRecord(payload)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
      `响应结构不是对象：${url}`,
    )
  }
  if (isRecord(payload.error)) {
    const code = payload.error.code
    const message = payload.error.message
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.RESPONSE_API_ERROR,
      `Deribit 返回错误：${typeof message === 'string' ? message : '未知错误'}`,
      { url, code: typeof code === 'number' ? code : null },
    )
  }
  if (!('result' in payload)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
      `响应缺少 result 字段：${url}`,
    )
  }
  return payload.result
}

/**
 * 创建 Deribit 客户端。
 *
 * @param options HTTP 客户端、代理与超时
 * @returns 期权链与指数价拉取接口
 */
export function createDeribitClient(options: DeribitClientOptions): DeribitClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DERIBIT_TIMEOUT_MS

  return {
    async getOptionChain(currency: OptionCurrency): Promise<DeribitOptionChain> {
      const url = `${DERIBIT_API_BASE}/public/get_book_summary_by_currency?currency=${currency}&kind=option`
      const response = await options.httpClient.getText({
        url,
        timeoutMs,
        proxy: options.proxy,
      })
      const result = readResult(parseJsonBody(response.body, url), url)
      if (!Array.isArray(result)) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
          `期权链 result 不是数组：${url}`,
        )
      }

      const contracts = result.map((row) => {
        if (!isRecord(row)) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `期权链存在非对象记录：${url}`,
          )
        }
        return toOptionContract(row, currency)
      })

      return { contracts, elapsedMs: response.elapsedMs }
    },

    async getIndexPrice(currency: OptionCurrency): Promise<DeribitIndexPrice> {
      const indexName = INDEX_NAME_BY_CURRENCY[currency]
      const url = `${DERIBIT_API_BASE}/public/get_index_price?index_name=${indexName}`
      const response = await options.httpClient.getText({
        url,
        timeoutMs,
        proxy: options.proxy,
      })
      const result = readResult(parseJsonBody(response.body, url), url)
      if (!isRecord(result)) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
          `指数价格 result 不是对象：${url}`,
        )
      }
      return {
        indexPrice: readFiniteNumber(result, 'index_price', indexName),
        estimatedDeliveryPrice: readFiniteNumber(result, 'estimated_delivery_price', indexName),
        elapsedMs: response.elapsedMs,
      }
    },
  }
}
