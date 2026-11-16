/**
 * 交易所 JSON 响应的共用读取：解析、对象判定与字段取值。
 *
 * Deribit 与 Binance 的响应外壳不同（前者是 jsonrpc 的 result，后者是裸数组或对象），
 * 但「解析 JSON、区分缺失与非法值、给错误带上下文」这部分一致，放在一处避免两份实现漂移。
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'

/**
 * 判断值是否为普通对象。
 *
 * @param value 任意值
 * @returns 是否对象
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
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
export function parseJsonBody(body: string, url: string): unknown {
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
 * 读取必填数字字段。
 *
 * @param record 响应对象
 * @param key 字段名
 * @param context 错误上下文（合约名或端点）
 * @returns 有限数字
 * @throws AnalyticsError 字段缺失或不是数字
 */
export function readFiniteNumber(
  record: Record<string, unknown>,
  key: string,
  context: string,
): number {
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
 * 读取必填数字字段，兼容「数字被写成字符串」的响应。
 *
 * Binance 的 markIV、indexPrice、sumOpenInterest 都是字符串，逐个字段写 Number() 会到处漏判。
 *
 * @param record 响应对象
 * @param key 字段名
 * @param context 错误上下文
 * @returns 有限数字
 * @throws AnalyticsError 字段缺失或无法解析成有限数字
 */
export function readNumberLike(
  record: Record<string, unknown>,
  key: string,
  context: string,
): number {
  const value = record[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  throw new AnalyticsError(
    ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
    `${context} 的 ${key} 不是有限数字`,
    { context, key, valueType: typeof value },
  )
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
export function readText(record: Record<string, unknown>, key: string, context: string): string {
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
