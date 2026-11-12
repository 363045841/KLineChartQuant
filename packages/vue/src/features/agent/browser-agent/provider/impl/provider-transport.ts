// Provider 网络请求的传输注册表：默认直连，宿主可替换为同源代理。
//
// 浏览器直连第三方 Provider 时必须依赖对方提供 CORS 头，本地网关常常没有。
// 宿主（桌面端主进程、开发服务器）可以在启动时把一个同源代理实现交给这里，
// Provider 的模型目录、连接测试与流式对话因此都走同一条路径。

/** 当前生效的 Provider 请求实现。闭包在调用时才解析全局 fetch，便于测试替换。 */
let activeTransport: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, init)

/**
 * 替换 Provider 请求的传输实现。
 *
 * @param transport 宿主提供的 fetch 兼容实现；传 null 恢复默认直连。
 */
export function setProviderTransport(transport: typeof globalThis.fetch | null): void {
  activeTransport = transport ?? ((input, init) => globalThis.fetch(input, init))
}

/**
 * 取当前生效的 Provider 请求实现。
 *
 * @returns 与全局 fetch 签名一致的函数。
 */
export function providerFetch(): typeof globalThis.fetch {
  return activeTransport
}
