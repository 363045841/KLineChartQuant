/**
 * 预览开发服务器的 Provider 同源代理。
 *
 * 浏览器直连第三方 Provider 需要对方返回 CORS 头，本地网关常常没有。
 * 这里把真实地址放在请求头里，由开发服务器在 Node 侧转发；响应按流回传，
 * 因此 SSE 流式对话不会被整体缓冲。仅用于本地开发，不是产品运行时能力。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import {
  PROVIDER_PROXY_PATH,
  PROVIDER_PROXY_TARGET_HEADER,
} from '../src/features/agent/browser-agent/provider/impl/provider-proxy-transport'

/** 转发到上游时必须剔除的请求头：逐跳头与承载目标地址的代理头。 */
const REQUEST_HEADERS_TO_SKIP = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  PROVIDER_PROXY_TARGET_HEADER,
])

/** 回传时剔除的响应头：长度与编码已由转发层重新计算。 */
const RESPONSE_HEADERS_TO_SKIP = new Set([
  'connection',
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'keep-alive',
])

/**
 * 读取完整请求体。
 *
 * @param req 代理收到的请求。
 * @returns 请求体；无请求体时返回 undefined。
 */
async function readRequestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

/**
 * 以 JSON 返回代理自身的错误。
 *
 * @param res 代理响应。
 * @param status HTTP 状态码。
 * @param message 错误说明。
 */
function fail(res: ServerResponse, status: number, message: string): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ error: message }))
}

/**
 * 把一次代理请求转发到真实 Provider，并把响应流回浏览器。
 *
 * @param req 代理收到的请求。
 * @param res 代理响应。
 */
async function forward(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const target = req.headers[PROVIDER_PROXY_TARGET_HEADER]
  if (typeof target !== 'string') {
    fail(res, 400, 'Missing provider target header.')
    return
  }
  let url: URL
  try {
    url = new URL(target)
  } catch {
    fail(res, 400, 'Invalid provider target.')
    return
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fail(res, 400, 'Only http and https providers can be proxied.')
    return
  }

  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || REQUEST_HEADERS_TO_SKIP.has(name)) continue
    headers.set(name, Array.isArray(value) ? value.join(', ') : value)
  }

  let upstream: Response
  try {
    const body = await readRequestBody(req)
    upstream = await fetch(url, {
      method: req.method,
      headers,
      // Buffer 的 ArrayBufferLike 泛型不在 BodyInit 里，复制成普通 Uint8Array 再发送
      body: body === undefined ? undefined : new Uint8Array(body),
    })
  } catch (error) {
    fail(res, 502, error instanceof Error ? error.message : 'Provider request failed.')
    return
  }

  res.statusCode = upstream.status
  upstream.headers.forEach((value, name) => {
    if (!RESPONSE_HEADERS_TO_SKIP.has(name)) res.setHeader(name, value)
  })
  if (!upstream.body) {
    res.end()
    return
  }
  const reader = upstream.body.getReader()
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    res.write(chunk.value)
  }
  res.end()
}

/** 在开发服务器上挂载 Provider 同源代理。 */
export function providerProxyPlugin(): Plugin {
  return {
    name: 'klinechart:provider-proxy',
    configureServer(server) {
      server.middlewares.use(PROVIDER_PROXY_PATH, (req, res, next) => {
        forward(req, res).catch(next)
      })
    },
  }
}
