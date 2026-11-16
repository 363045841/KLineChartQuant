// 期权序列的浏览器客户端：只拼 URL、带超时，业务口径全部留在 analytics 侧。

import type { OptionClientOptions, OptionPanelSource } from '../types.js'

/** 只读服务默认地址，与 `analytics serve` 的默认端口一致。 */
const DEFAULT_OPTION_SERVICE_BASE_URL = 'http://127.0.0.1:8093'

/** 单次请求超时（毫秒）。本地服务正常在几十毫秒量级。 */
const REQUEST_TIMEOUT_MS = 8000

/** 面板一次请求取几行；面板只画最新一行，历史由 Agent 工具按需另取。 */
const SERIES_LIMIT = 1

/** 面板统计窗口：一个月、一个季度、一年。 */
const STATS_WINDOWS: readonly number[] = [30, 90, 365]

/**
 * 创建期权序列客户端。
 *
 * @param options fetch 与服务地址
 * @returns 面板数据来源
 */
export function createOptionClient(options: OptionClientOptions): OptionPanelSource {
  const baseUrl = (options.baseUrl ?? DEFAULT_OPTION_SERVICE_BASE_URL).replace(/\/+$/, '')

  /**
   * 发一次请求并解析 JSON。
   *
   * @param path 路径与查询
   * @param signal 取消信号
   * @returns 解析后的值
   */
  async function request(path: string, signal?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    const merged = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const response = await options.fetch(`${baseUrl}${path}`, { signal: merged })
    if (!response.ok) {
      throw new Error(`期权服务返回 ${response.status}：${path}`)
    }
    return JSON.parse(await response.text()) as unknown
  }

  return {
    async fetchSeries(currency: string, signal?: AbortSignal, limit?: number): Promise<unknown> {
      const query = new URLSearchParams({ currency, limit: String(limit ?? SERIES_LIMIT) })
      return request(`/options/series?${query.toString()}`, signal)
    },

    async fetchStats(
      currency: string,
      windows?: readonly number[],
      signal?: AbortSignal,
    ): Promise<unknown> {
      const query = new URLSearchParams({
        currency,
        windows: (windows ?? STATS_WINDOWS).join(','),
      })
      return request(`/options/stats?${query.toString()}`, signal)
    },
  }
}
