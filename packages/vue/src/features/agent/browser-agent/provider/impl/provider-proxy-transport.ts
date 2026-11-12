// 同源 Provider 代理的浏览器侧实现。
//
// 代理把「请求哪个地址」从 URL 移到请求头里，浏览器因此只访问同源路径，
// 不再触发跨源检查；响应保持流式，SSE 对话不会被整体缓冲。

/** 代理端点路径，宿主必须在这个路径上提供转发。 */
export const PROVIDER_PROXY_PATH = '/__provider-proxy'

/** 承载真实目标地址的请求头，转发时必须从上游请求里剔除。 */
export const PROVIDER_PROXY_TARGET_HEADER = 'x-provider-target'

/**
 * 创建走同源代理的 fetch 实现。
 *
 * @param endpoint 代理端点路径。
 * @param transport 实际发出同源请求的实现，测试可替换。
 * @returns 与全局 fetch 签名一致的函数。
 */
export function createProviderProxyFetch(
  endpoint: string = PROVIDER_PROXY_PATH,
  transport: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, init),
): typeof globalThis.fetch {
  return (input, init) => {
    const request = input instanceof Request ? input : undefined
    const target = request ? request.url : String(input)
    const headers = new Headers(init?.headers ?? request?.headers)
    headers.set(PROVIDER_PROXY_TARGET_HEADER, target)
    return transport(endpoint, {
      method: init?.method ?? request?.method ?? 'GET',
      headers,
      body: init?.body,
      signal: init?.signal ?? request?.signal,
      credentials: 'same-origin',
    })
  }
}
