/**
 * 数据源运行时 Base URL 覆盖表
 * 由聚合源管理面板写入，fetch 时按 source name 读取
 * 无覆盖时回退到 DataFetcher 注册时的 defaultBaseUrl
 */

const overrides = new Map<string, string>()

/**
 * 去掉末尾斜杠，保证拼接 path 时不会出现双斜杠
 */
export function normalizeFetcherBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

/**
 * 写入或清除某个数据源的 Base URL
 * @param name - 注册名，如 gotdx
 * @param baseUrl - 完整 origin；空字符串表示清除覆盖
 */
export function setFetcherBaseUrl(name: string, baseUrl: string | undefined): void {
  const trimmed = baseUrl?.trim()
  if (!trimmed) {
    overrides.delete(name)
    return
  }
  overrides.set(name, normalizeFetcherBaseUrl(trimmed))
}

/**
 * 读取数据源当前生效的 Base URL
 * @param name - 注册名
 * @param fallback - 无覆盖时使用的默认值（通常来自 definition.defaultBaseUrl）
 */
export function getFetcherBaseUrl(name: string, fallback: string): string {
  return overrides.get(name) ?? normalizeFetcherBaseUrl(fallback)
}

/**
 * 从 Base URL 解析 host 与 port，供 UI 分栏编辑
 */
export function parseFetcherEndpoint(baseUrl: string): { host: string; port: string } {
  try {
    const url = new URL(baseUrl.includes('://') ? baseUrl : `http://${baseUrl}`)
    return {
      host: url.hostname,
      port: url.port,
    }
  } catch {
    return { host: '', port: '' }
  }
}

/**
 * 用 host + port 拼回 Base URL，协议与 fallback 保持一致
 * @remarks port 为空时不写端口段，由浏览器按协议默认端口处理
 */
export function composeFetcherBaseUrl(host: string, port: string, fallbackBaseUrl: string): string {
  let protocol = 'http:'
  try {
    protocol = new URL(
      fallbackBaseUrl.includes('://') ? fallbackBaseUrl : `http://${fallbackBaseUrl}`,
    ).protocol
  } catch {
    // fallback 非法时仍用 http
  }
  const h = host.trim()
  if (!h) return normalizeFetcherBaseUrl(fallbackBaseUrl)
  const p = port.trim()
  return normalizeFetcherBaseUrl(p ? `${protocol}//${h}:${p}` : `${protocol}//${h}`)
}

/** 测试用：清空全部运行时覆盖 */
export function clearFetcherBaseUrlsForTest(): void {
  overrides.clear()
}
