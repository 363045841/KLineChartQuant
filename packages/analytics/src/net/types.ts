/**
 * 网络层契约。
 *
 * 采集器只依赖 `HttpClient` 接口：真实实现走 node:https，单元测试用替身返回固定响应。
 * 这样业务逻辑（拉取 → 解析 → 聚合）不直接碰网络，也不需要 mock 全局 fetch。
 */

/** HTTP 代理端点。 */
export interface ProxyEndpoint {
  /** 代理主机 */
  readonly host: string
  /** 代理端口 */
  readonly port: number
}

/** 一次 GET 请求的参数。 */
export interface HttpGetOptions {
  /** 完整 URL */
  readonly url: string
  /** 超时毫秒；超时直接失败，不允许无限等待 */
  readonly timeoutMs: number
  /**
   * 代理端点；`null` 表示直连。
   * Deribit 在本机必须走代理，由调用方显式传入，不做环境变量隐式回退。
   */
  readonly proxy: ProxyEndpoint | null
}

/** GET 的文本结果。 */
export interface HttpTextResponse {
  /** HTTP 状态码 */
  readonly status: number
  /** 响应体原文 */
  readonly body: string
  /** 从发起到读完响应的耗时（毫秒） */
  readonly elapsedMs: number
}

/** 一次 POST 请求的参数。 */
export interface HttpPostOptions extends HttpGetOptions {
  /** 请求体（已序列化的 JSON 文本） */
  readonly body: string
}

/** HTTP 客户端契约。 */
export interface HttpClient {
  /**
   * 发起一次 GET 并读回文本响应。
   *
   * @param options 请求参数
   * @returns 状态、响应体与耗时
   * @throws AnalyticsError 超时、代理不可用、非 2xx、响应超限时抛出
   */
  readonly getText: (options: HttpGetOptions) => Promise<HttpTextResponse>

  /**
   * 发起一次 JSON POST 并读回文本响应。
   *
   * 只有 Hyperliquid 这类「查询也要 POST」的接口需要它；其余交易所走 GET。
   *
   * @param options 请求参数
   * @returns 状态、响应体与耗时
   * @throws AnalyticsError 超时、代理不可用、非 2xx、响应超限时抛出
   */
  readonly postJson: (options: HttpPostOptions) => Promise<HttpTextResponse>
}
