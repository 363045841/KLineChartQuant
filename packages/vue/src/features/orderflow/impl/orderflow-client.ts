// 订单流只读服务的浏览器客户端：把 HTTP 细节收在一处，工具与面板共用同一套请求。

import type { OrderflowClientOptions, OrderflowPanelSource } from '../types.js'

/** 只读服务默认地址，与 `analytics serve` 的默认端口一致。 */
export const DEFAULT_ORDERFLOW_BASE_URL = 'http://127.0.0.1:8093'

/** 单次请求超时（毫秒）。本地服务正常在 100ms 量级，超过说明盘读不到或服务没起。 */
const REQUEST_TIMEOUT_MS = 8000

/**
 * 拼接查询串。
 *
 * @param params 参数表
 * @returns 查询串（含前导 ?）
 */
function toQuery(params: Readonly<Record<string, string>>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    search.set(key, value)
  }
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

/**
 * 创建订单流客户端。
 *
 * 只做三件事：拼 URL、带超时、把非 2xx 转成可读错误。不做业务计算——
 * 跨所合计、矛盾识别都在 analytics 侧唯一实现，前端复刻会让口径漂移。
 *
 * @param options fetch 与服务地址
 * @returns 面板数据来源
 */
export function createOrderflowClient(options: OrderflowClientOptions): OrderflowPanelSource {
  const baseUrl = (options.baseUrl ?? DEFAULT_ORDERFLOW_BASE_URL).replace(/\/+$/, '')

  /**
   * 发起一次带超时的 GET。
   *
   * @param path 路径（含查询串）
   * @param signal 外部取消信号
   * @returns 响应文本
   */
  async function getText(path: string, signal?: AbortSignal): Promise<string> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    const merged = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const response = await options.fetch(`${baseUrl}${path}`, { signal: merged })
    if (!response.ok) {
      throw new Error(`订单流服务返回 ${response.status}：${path}`)
    }
    return response.text()
  }

  return {
    fetchPanelText(symbol: string, signal?: AbortSignal): Promise<string> {
      const query = toQuery({ symbol, format: 'text' })
      return getText(`/orderflow/panel${query}`, signal)
    },
    async fetchPanel(symbol: string, signal?: AbortSignal): Promise<unknown> {
      const query = toQuery({ symbol })
      const body = await getText(`/orderflow/panel${query}`, signal)
      return JSON.parse(body) as unknown
    },
  }
}
