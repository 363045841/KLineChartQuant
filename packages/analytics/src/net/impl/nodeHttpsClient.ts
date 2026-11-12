/**
 * 基于 node:https 的 HTTP 客户端实现。
 *
 * 支持直连与 HTTP 代理（CONNECT 隧道）两种模式。代理不可用、隧道被拒、超时、非 2xx
 * 都抛出带稳定错误码的 `AnalyticsError`，保证采集失败时立即报出明确原因，而不是一直空转。
 */
import type { IncomingMessage } from 'node:http'
import { request } from 'node:https'
import { connect as connectTcp } from 'node:net'
import { connect as connectTls, type TLSSocket } from 'node:tls'
import { ANALYTICS_ERROR_CODES, AnalyticsError, toError } from '../../errors'
import type {
  HttpClient,
  HttpGetOptions,
  HttpPostOptions,
  HttpTextResponse,
  ProxyEndpoint,
} from '../types'

/** 单次响应体上限：Deribit 全链 391KB、Binance klines 约 1MB，8MB 留足余量。 */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024

/** 请求标识，便于数据源侧排查流量来源。 */
const USER_AGENT = 'kcq-analytics/0.1.0'

/** 目标端口：本采集器只访问 HTTPS 443。 */
const HTTPS_PORT = 443

/** 代理隧道成功状态码。 */
const TUNNEL_OK_STATUS = '200'

/** 网络类错误的重试次数上限。 */
const MAX_RETRIES = 3

/** 首次重试前的等待（毫秒），之后按 2 倍递增。 */
const RETRY_BASE_DELAY_MS = 500

/** 值得重试的错误码：都是瞬时的网络或服务端问题。 */
const RETRYABLE_CODES: readonly string[] = [
  ANALYTICS_ERROR_CODES.NETWORK_REQUEST_FAILED,
  ANALYTICS_ERROR_CODES.NETWORK_TIMEOUT,
  ANALYTICS_ERROR_CODES.NETWORK_PROXY_UNAVAILABLE,
]

/**
 * 判断一次失败是否值得重试。
 *
 * 只重试瞬时问题：连接被重置（ECONNRESET）、DNS 暂时失败（ENOENT）、超时、5xx。
 * 4xx、JSON 解析失败、结构不符都不重试——那些重试一百次也一样。
 * 这条区分很重要：数据不可回溯，宁可多试几次，但也不能把确定性失败变成无限等待。
 *
 * @param error 捕获到的错误
 * @returns 值得重试时为 true
 */
function isRetryable(error: unknown): boolean {
  if (!(error instanceof AnalyticsError)) return false
  if (RETRYABLE_CODES.includes(error.code)) return true
  if (error.code === ANALYTICS_ERROR_CODES.RESPONSE_HTTP_STATUS) {
    const status = Number(error.details.status)
    return Number.isFinite(status) && status >= 500
  }
  return false
}

/**
 * 等待指定毫秒。
 *
 * @param ms 毫秒
 * @returns 完成信号
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * 通过 HTTP 代理建立到目标主机的 TLS 隧道（CONNECT 方法）。
 *
 * @param proxy 代理端点
 * @param targetHost 目标主机名
 * @param targetPort 目标端口
 * @param timeoutMs 隧道建立超时
 * @returns 完成 TLS 握手的 socket
 * @throws AnalyticsError 代理不可用、隧道被拒或超时
 */
function createTunnelSocket(
  proxy: ProxyEndpoint,
  targetHost: string,
  targetPort: number,
  timeoutMs: number,
): Promise<TLSSocket> {
  return new Promise<TLSSocket>((resolve, reject) => {
    const authority = `${targetHost}:${targetPort}`
    const socket = connectTcp({ host: proxy.host, port: proxy.port })
    let settled = false
    let pending = Buffer.alloc(0)
    let timer: ReturnType<typeof setTimeout> | undefined

    const settle = (error: Error | null, tunnel?: TLSSocket): void => {
      if (settled) {
        return
      }
      settled = true
      if (timer !== undefined) {
        clearTimeout(timer)
      }
      socket.removeListener('data', onData)
      if (error !== null) {
        socket.destroy()
        reject(error)
        return
      }
      if (tunnel !== undefined) {
        resolve(tunnel)
      }
    }

    const onData = (chunk: Buffer): void => {
      pending = Buffer.concat([pending, chunk])
      const headerEnd = pending.indexOf('\r\n\r\n')
      if (headerEnd < 0) {
        return
      }
      const statusLine = pending.subarray(0, headerEnd).toString('latin1').split('\r\n')[0] ?? ''
      const statusCode = statusLine.split(' ')[1] ?? ''
      if (statusCode !== TUNNEL_OK_STATUS) {
        settle(
          new AnalyticsError(
            ANALYTICS_ERROR_CODES.NETWORK_TUNNEL_REJECTED,
            `代理拒绝 CONNECT ${authority}：${statusLine}`,
            { proxy: `${proxy.host}:${proxy.port}`, statusLine },
          ),
        )
        return
      }
      settle(null, connectTls({ socket, servername: targetHost }))
    }

    timer = setTimeout(() => {
      settle(
        new AnalyticsError(
          ANALYTICS_ERROR_CODES.NETWORK_TIMEOUT,
          `连接代理 ${proxy.host}:${proxy.port} 超时（${timeoutMs}ms）`,
        ),
      )
    }, timeoutMs)

    socket.once('error', (error: NodeJS.ErrnoException) => {
      settle(
        new AnalyticsError(
          ANALYTICS_ERROR_CODES.NETWORK_PROXY_UNAVAILABLE,
          `代理不可用：${proxy.host}:${proxy.port}（${error.code ?? error.message}）`,
          { proxy: `${proxy.host}:${proxy.port}`, code: error.code ?? null },
        ),
      )
    })

    socket.once('connect', () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`)
    })

    socket.on('data', onData)
  })
}

/**
 * 创建真实网络客户端。
 *
 * GET 与 POST 共用同一条请求管线：代理隧道、超时、响应体上限、错误码完全一致，
 * 只有方法与请求体不同。分开实现会让两边的超时与限额逐渐漂移。
 *
 * @returns 直连与代理都能用的 `HttpClient`
 */
export function createNodeHttpsClient(): HttpClient {
  /** 一次请求的构造参数。 */
  interface RequestSpec {
    readonly url: string
    readonly timeoutMs: number
    readonly proxy: ProxyEndpoint | null
    readonly method: 'GET' | 'POST'
    readonly body: string | null
  }

  /**
   * 发起一次请求并读回文本。
   *
   * @param spec 请求参数
   * @returns 状态、响应体与耗时
   */
  function requestText(spec: RequestSpec): Promise<HttpTextResponse> {
    return new Promise<HttpTextResponse>((resolve, reject) => {
      const url = new URL(spec.url)
      const startedAt = Date.now()
      let settled = false
      let deadline: ReturnType<typeof setTimeout> | undefined

      const settle = (error: Error | null, response?: HttpTextResponse): void => {
        if (settled) {
          return
        }
        settled = true
        if (deadline !== undefined) {
          clearTimeout(deadline)
        }
        if (error !== null) {
          reject(error)
          return
        }
        if (response !== undefined) {
          resolve(response)
          return
        }
        reject(
          new AnalyticsError(
            ANALYTICS_ERROR_CODES.NETWORK_REQUEST_FAILED,
            `请求未返回结果：${spec.url}`,
          ),
        )
      }

      deadline = setTimeout(() => {
        settle(
          new AnalyticsError(
            ANALYTICS_ERROR_CODES.NETWORK_TIMEOUT,
            `请求超时（${spec.timeoutMs}ms）：${spec.url}`,
          ),
        )
      }, spec.timeoutMs)

      const headers: Record<string, string> = {
        accept: 'application/json',
        'user-agent': USER_AGENT,
      }
      if (spec.body !== null) {
        headers['content-type'] = 'application/json'
        headers['content-length'] = String(Buffer.byteLength(spec.body))
      }

      const send = (createConnection?: () => TLSSocket): void => {
        const clientRequest = request(
          {
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port === '' ? HTTPS_PORT : Number(url.port),
            path: `${url.pathname}${url.search}`,
            method: spec.method,
            headers,
            // 不设 agent: false：那会让 Node 新建默认 agent 并绕过这里的 createConnection，
            // 请求会一直挂到超时。默认 https agent 不保持长连接，每次仍走一条新隧道。
            ...(createConnection === undefined ? {} : { createConnection }),
          },
          (message: IncomingMessage) => {
            const status = message.statusCode ?? 0
            const chunks: Buffer[] = []
            let received = 0

            message.on('data', (chunk: Buffer) => {
              received += chunk.length
              if (received > MAX_RESPONSE_BYTES) {
                message.destroy()
                settle(
                  new AnalyticsError(
                    ANALYTICS_ERROR_CODES.RESPONSE_TOO_LARGE,
                    `响应体超过 ${MAX_RESPONSE_BYTES} 字节：${spec.url}`,
                  ),
                )
                return
              }
              chunks.push(chunk)
            })

            message.on('end', () => {
              const body = Buffer.concat(chunks).toString('utf8')
              if (status < 200 || status >= 300) {
                settle(
                  new AnalyticsError(
                    ANALYTICS_ERROR_CODES.RESPONSE_HTTP_STATUS,
                    `HTTP ${status}：${spec.url}`,
                    { status, excerpt: body.slice(0, 300) },
                  ),
                )
                return
              }
              settle(null, { status, body, elapsedMs: Date.now() - startedAt })
            })

            message.on('error', (error: NodeJS.ErrnoException) => {
              settle(
                new AnalyticsError(
                  ANALYTICS_ERROR_CODES.NETWORK_REQUEST_FAILED,
                  `读取响应失败：${error.code ?? error.message}`,
                  { code: error.code ?? null },
                ),
              )
            })
          },
        )

        clientRequest.on('error', (error: NodeJS.ErrnoException) => {
          settle(
            new AnalyticsError(
              ANALYTICS_ERROR_CODES.NETWORK_REQUEST_FAILED,
              `请求失败：${spec.url}（${error.code ?? error.message}）`,
              { code: error.code ?? null },
            ),
          )
        })

        clientRequest.setTimeout(spec.timeoutMs, () => {
          clientRequest.destroy()
          settle(
            new AnalyticsError(
              ANALYTICS_ERROR_CODES.NETWORK_TIMEOUT,
              `请求超时（${spec.timeoutMs}ms）：${spec.url}`,
            ),
          )
        })

        if (spec.body !== null) {
          clientRequest.write(spec.body)
        }
        clientRequest.end()
      }

      if (spec.proxy === null) {
        send()
        return
      }

      createTunnelSocket(spec.proxy, url.hostname, HTTPS_PORT, spec.timeoutMs).then(
        (socket) => send(() => socket),
        (error: unknown) => settle(toError(error)),
      )
    })
  }

  /**
   * 带重试的请求：瞬时网络问题重试，确定性失败立刻抛出。
   *
   * @param spec 请求参数
   * @returns 状态、响应体与耗时
   */
  async function requestWithRetry(spec: RequestSpec): Promise<HttpTextResponse> {
    let lastError: unknown = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        return await requestText(spec)
      } catch (error) {
        lastError = error
        if (attempt === MAX_RETRIES || !isRetryable(error)) throw error
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt)
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new AnalyticsError(
          ANALYTICS_ERROR_CODES.NETWORK_REQUEST_FAILED,
          `请求在 ${MAX_RETRIES} 次重试后仍失败：${spec.url}`,
        )
  }

  return {
    getText(options: HttpGetOptions): Promise<HttpTextResponse> {
      return requestWithRetry({ ...options, method: 'GET', body: null })
    },
    postJson(options: HttpPostOptions): Promise<HttpTextResponse> {
      return requestWithRetry({ ...options, method: 'POST', body: options.body })
    },
  }
}
