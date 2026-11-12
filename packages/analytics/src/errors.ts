/**
 * 分析数据采集器的错误码与错误类型。
 *
 * 错误码集中在本文件，业务代码只引用具名常量，禁止散落字符串字面量。
 * 错误码保持 append-only：新增场景只能追加，不能改动既有值。
 */

/** 采集器错误码。 */
export const ANALYTICS_ERROR_CODES = {
  /** 请求在超时时间内没有完成 */
  NETWORK_TIMEOUT: 'ANALYTICS_NETWORK_TIMEOUT',
  /** 代理端口不可用（连接被拒绝、DNS 失败等） */
  NETWORK_PROXY_UNAVAILABLE: 'ANALYTICS_NETWORK_PROXY_UNAVAILABLE',
  /** 代理拒绝 CONNECT 隧道 */
  NETWORK_TUNNEL_REJECTED: 'ANALYTICS_NETWORK_TUNNEL_REJECTED',
  /** 请求层失败（ECONNRESET、socket hang up 等） */
  NETWORK_REQUEST_FAILED: 'ANALYTICS_NETWORK_REQUEST_FAILED',
  /** 服务端返回非 2xx */
  RESPONSE_HTTP_STATUS: 'ANALYTICS_RESPONSE_HTTP_STATUS',
  /** 响应体超过上限 */
  RESPONSE_TOO_LARGE: 'ANALYTICS_RESPONSE_TOO_LARGE',
  /** 响应不是合法 JSON */
  RESPONSE_INVALID_JSON: 'ANALYTICS_RESPONSE_INVALID_JSON',
  /** 数据源在响应体里返回业务错误（如 Deribit JSON-RPC error） */
  RESPONSE_API_ERROR: 'ANALYTICS_RESPONSE_API_ERROR',
  /** 响应字段缺失或类型不符 */
  RESPONSE_SHAPE_INVALID: 'ANALYTICS_RESPONSE_SHAPE_INVALID',
  /** instrument_name 无法解析 */
  INSTRUMENT_UNPARSEABLE: 'ANALYTICS_INSTRUMENT_UNPARSEABLE',
  /** 过滤后没有可用合约 */
  AGGREGATE_EMPTY: 'ANALYTICS_AGGREGATE_EMPTY',
  /** 聚合输入非法（价格为负、波动率为零等） */
  AGGREGATE_INPUT_INVALID: 'ANALYTICS_AGGREGATE_INPUT_INVALID',
  /** 买卖量拆分不守恒：takerBuyBaseVolume + 卖出量 != volume */
  VOLUME_SPLIT_MISMATCH: 'ANALYTICS_VOLUME_SPLIT_MISMATCH',
  /** 分片写入失败 */
  STORAGE_WRITE_FAILED: 'ANALYTICS_STORAGE_WRITE_FAILED',
  /** 分片内容无法解析 */
  STORAGE_READ_INVALID: 'ANALYTICS_STORAGE_READ_INVALID',
  /** 流标识非法（空段、`..`、非法字符） */
  STORAGE_STREAM_INVALID: 'ANALYTICS_STORAGE_STREAM_INVALID',
  /** cloudtrade 数据目录或文件不存在 */
  CLOUDTRADE_SOURCE_MISSING: 'ANALYTICS_CLOUDTRADE_SOURCE_MISSING',
  /** cloudtrade 单条记录字段非法 */
  CLOUDTRADE_RECORD_INVALID: 'ANALYTICS_CLOUDTRADE_RECORD_INVALID',
  /** 命令行参数非法 */
  ARGUMENT_INVALID: 'ANALYTICS_ARGUMENT_INVALID',
  /** 未知子命令 */
  CLI_COMMAND_UNKNOWN: 'ANALYTICS_CLI_COMMAND_UNKNOWN',
} as const

/** 采集器错误码联合类型。 */
export type AnalyticsErrorCode = (typeof ANALYTICS_ERROR_CODES)[keyof typeof ANALYTICS_ERROR_CODES]

/** 采集器统一错误：携带稳定错误码与结构化细节，便于区分失败类型。 */
export class AnalyticsError extends Error {
  /** 稳定错误码 */
  readonly code: AnalyticsErrorCode

  /** 结构化上下文（代理地址、HTTP 状态、响应片段等） */
  readonly details: Readonly<Record<string, unknown>>

  /**
   * @param code 错误码
   * @param message 面向人的失败原因
   * @param details 结构化上下文，默认空对象
   */
  constructor(
    code: AnalyticsErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message)
    this.name = 'AnalyticsError'
    this.code = code
    this.details = details
  }
}

/**
 * 把任意抛出值收敛为 Error，避免在错误处理链里出现 `unknown` 分支。
 *
 * @param value 捕获到的任意值
 * @returns 原始 Error，或包了字符串的 Error
 */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
