// 期权序列的浏览器客户端：只拼 URL、带超时，业务口径全部留在 analytics 侧。

import type { OptionClientOptions, OptionPanelSource } from '../types.js'

/** 只读服务默认地址，与 `analytics serve` 的默认端口一致。 */
const DEFAULT_OPTION_SERVICE_BASE_URL = 'http://127.0.0.1:8093'

/** 单次请求超时（毫秒）。本地服务正常在几十毫秒量级。 */
const REQUEST_TIMEOUT_MS = 8000

/** 一次请求取几行；面板只画最新一行，多取一行便于判断是否在更新。 */
const SERIES_LIMIT = 1

/**
 * 创建期权序列客户端。
 *
 * @param options fetch 与服务地址
 * @returns 面板数据来源
 */
export function createOptionClient(options: OptionClientOptions): OptionPanelSource {
  const baseUrl = (options.baseUrl ?? DEFAULT_OPTION_SERVICE_BASE_URL).replace(/\/+$/, '')

  return {
    async fetchSeries(currency: string, signal?: AbortSignal): Promise<unknown> {
      const query = new URLSearchParams({ currency, limit: String(SERIES_LIMIT) })
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      const merged = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
      const response = await options.fetch(`${baseUrl}/options/series?${query.toString()}`, {
        signal: merged,
      })
      if (!response.ok) {
        throw new Error(`期权服务返回 ${response.status}：${currency}`)
      }
      return JSON.parse(await response.text()) as unknown
    },
  }
}
