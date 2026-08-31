// OpenAI-compatible Provider 的 HTTP 请求、超时、重试与脱敏诊断工具。
import { AgentRuntimeError } from '../contracts/errors.js'

import type { AgentRuntimeErrorCode } from '../contracts/errors.js'
import type { ProviderDiagnostic } from './types.js'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_MAX_RETRY_DELAY_MS = 60_000

/** Provider JSON 请求的可注入运行参数。 */
export interface ProviderHttpOptions {
  fetch: typeof globalThis.fetch
  now: () => number
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  timeoutMs?: number
  maxRetries?: number
  maxRetryDelayMs?: number
  signal?: AbortSignal
  stage?: ProviderDiagnostic['stage']
  diagnostics?: (diagnostic: ProviderDiagnostic) => void
}

/** HTTP 调用中可用于错误分类的观察结果。 */
export interface ProviderHttpObservation {
  status?: number
  retryAfterMs?: number
  timedOut: boolean
  malformed: boolean
  networkFailure: boolean
}

/** 单次请求成功后返回的 JSON 值及请求观察结果。 */
interface RequestResult {
  value: unknown
  observation: ProviderHttpObservation
}

/** 创建带有统一重试语义和用户建议的运行时错误。 */
function stableError(
  code: AgentRuntimeErrorCode,
  message: string,
  retryable: boolean,
  recommendedAction: string,
): AgentRuntimeError {
  return new AgentRuntimeError(code, message, { retryable, recommendedAction })
}

/**
 * 校验并标准化 Provider API 根地址。
 *
 * @param value 用户输入的 Provider 地址。
 * @returns 不带末尾斜杠的 HTTP(S) 地址。
 * @throws {AgentRuntimeError} 地址包含不支持的协议、认证信息或查询片段时抛出。
 */
export function normalizeProviderBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new AgentRuntimeError('INVALID_PAYLOAD', 'The Provider Base URL is invalid.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new AgentRuntimeError('INVALID_PAYLOAD', 'The Provider Base URL is invalid.')
  }
  if (url.search || url.hash) {
    throw new AgentRuntimeError(
      'INVALID_PAYLOAD',
      'The Provider Base URL cannot contain a query or fragment.',
    )
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString().replace(/\/$/, '')
}

/**
 * 将 Retry-After 响应头解析为等待毫秒数。
 *
 * @param value Retry-After 的秒数或 HTTP 日期值。
 * @param now 当前时间，用于解析 HTTP 日期。
 * @returns 等待毫秒数；无法解析时返回 undefined。
 */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000)
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return undefined
  return Math.max(0, at - now)
}

/**
 * 将 Provider HTTP 状态码映射为稳定的 Agent 运行时错误。
 *
 * @param status Provider 返回的 HTTP 状态码。
 * @param retryAfterMs 服务端建议的重试等待时间。
 * @returns 面向调用方的分类错误。
 */
export function providerHttpError(status: number, retryAfterMs?: number): AgentRuntimeError {
  switch (status) {
    case 401:
      return stableError(
        'PROVIDER_AUTHENTICATION',
        'The Provider rejected the API credential.',
        false,
        'Check the API key and test the connection again.',
      )
    case 403:
      return stableError(
        'PROVIDER_PERMISSION',
        'The Provider denied access to this resource.',
        false,
        'Check the credential permissions or account access.',
      )
    case 404:
      return stableError(
        'PROVIDER_MODEL_NOT_FOUND',
        'The selected Provider model is unavailable.',
        false,
        'Refresh the model list and select another model.',
      )
    case 429: {
      const wait =
        retryAfterMs === undefined ? '' : ` Retry after ${Math.ceil(retryAfterMs / 1_000)} seconds.`
      return stableError(
        'PROVIDER_RATE_LIMITED',
        `The Provider rate-limited the request.${wait}`,
        true,
        'Wait for the retry window or select another model.',
      )
    }
    default:
      if (status >= 500) {
        return stableError(
          'PROVIDER_UNAVAILABLE',
          'The Provider is temporarily unavailable.',
          true,
          'Retry later or select another model.',
        )
      }
      return stableError(
        'PROVIDER_ERROR',
        'The Provider request was rejected.',
        false,
        'Review the Provider configuration and retry.',
      )
  }
}

/**
 * 等待指定时间，同时允许取消等待。
 *
 * @param milliseconds 等待时间。
 * @param signal 取消信号。
 * @returns 在延时完成后兑现的 Promise。
 */
function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

/** 默认的可取消延时实现，供请求重试复用。 */
export const sleepWithSignal = defaultSleep

/**
 * 合并调用方取消信号与单次请求超时信号。
 *
 * @param parent 调用方提供的取消信号。
 * @param timeoutMs 单次请求超时毫秒数。
 * @returns 合并信号、超时状态读取函数和资源清理函数。
 */
function requestSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number,
): {
  signal: AbortSignal
  timedOut: () => boolean
  cleanup: () => void
} {
  const controller = new AbortController()
  let timeout = false
  const abortFromParent = () => controller.abort(parent?.reason)
  if (parent?.aborted) abortFromParent()
  else parent?.addEventListener('abort', abortFromParent, { once: true })
  // 使用独立控制器区分调用方取消和模块主动超时。
  const timer = setTimeout(() => {
    timeout = true
    controller.abort(new DOMException('Provider request timed out.', 'TimeoutError'))
  }, timeoutMs)
  return {
    signal: controller.signal,
    timedOut: () => timeout,
    cleanup: () => {
      clearTimeout(timer)
      parent?.removeEventListener('abort', abortFromParent)
    },
  }
}

/** 判断状态码是否允许按 Provider 协议重试。 */
function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * 移除 URL 中可能泄漏认证信息的字段，供诊断日志使用。
 *
 * @param value 原始请求地址。
 * @returns 可安全记录的地址。
 */
export function redactProviderUrl(value: string): string {
  const url = new URL(value)
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  return url.toString()
}

/**
 * 提取无法解析响应体的非敏感形态信息。
 *
 * @param body 原始响应体文本。
 * @returns 用于诊断的字节数和内容形态。
 */
function malformedBodyDetails(
  body: string,
): Pick<ProviderDiagnostic, 'responseBodyBytes' | 'responseBodyShape'> {
  const firstContent = body.trimStart().toLowerCase()
  const responseBodyShape =
    firstContent.length === 0
      ? 'empty'
      : firstContent.startsWith('data:')
        ? 'sse'
        : firstContent.startsWith('<!doctype html') || firstContent.startsWith('<html')
          ? 'html'
          : firstContent.startsWith('{') || firstContent.startsWith('[')
            ? 'json-like'
            : 'other'
  return { responseBodyBytes: new TextEncoder().encode(body).byteLength, responseBodyShape }
}

/**
 * 请求 Provider JSON 接口，并统一处理超时、重试、错误分类和脱敏诊断。
 *
 * @param url Provider 请求地址。
 * @param init 原生 fetch 请求配置。
 * @param options 可注入的网络与重试运行参数。
 * @returns 已解析 JSON 及本次请求观察结果。
 * @throws {AgentRuntimeError} 请求失败、超时或响应不是合法 JSON 时抛出。
 */
export async function requestProviderJson(
  url: string,
  init: RequestInit,
  options: ProviderHttpOptions,
): Promise<RequestResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  const maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS
  let attempt = 0
  const method = init.method?.toUpperCase() ?? 'GET'
  const safeUrl = redactProviderUrl(url)

  // 重试计数仅在服务端明确允许重试的状态码后递增。
  while (true) {
    options.signal?.throwIfAborted()
    const scoped = requestSignal(options.signal, timeoutMs)
    const observation: ProviderHttpObservation = {
      timedOut: false,
      malformed: false,
      networkFailure: false,
    }
    const startedAt = options.now()
    options.diagnostics?.({
      phase: 'request',
      method,
      url: safeUrl,
      attempt: attempt + 1,
      stage: options.stage,
    })
    try {
      const response = await options.fetch(url, { ...init, signal: scoped.signal })
      observation.status = response.status
      observation.retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), options.now())
      const responseDiagnostic = {
        method,
        url: safeUrl,
        attempt: attempt + 1,
        status: response.status,
        contentType: response.headers.get('content-type') ?? undefined,
        durationMs: Math.max(0, options.now() - startedAt),
        stage: options.stage,
      }
      options.diagnostics?.({ phase: 'response', ...responseDiagnostic })
      if (!response.ok) {
        // 限制服务端等待建议，防止异常响应无限拉长交互。
        const retryDelay = Math.min(observation.retryAfterMs ?? 0, maxRetryDelayMs)
        if (attempt < maxRetries && shouldRetry(response.status)) {
          options.diagnostics?.({ phase: 'retry', ...responseDiagnostic })
          attempt += 1
          await options.sleep(retryDelay, options.signal)
          continue
        }
        throw providerHttpError(response.status, observation.retryAfterMs)
      }
      let body = ''
      try {
        body = await response.text()
        return { value: JSON.parse(body), observation }
      } catch {
        observation.malformed = true
        const error = stableError(
          'PROVIDER_MALFORMED_RESPONSE',
          'The Provider returned malformed JSON.',
          true,
          'Retry the request or select another model.',
        )
        options.diagnostics?.({
          phase: 'failure',
          ...responseDiagnostic,
          code: error.code,
          ...malformedBodyDetails(body),
        })
        throw error
      }
    } catch (error) {
      if (error instanceof AgentRuntimeError) throw error
      if (options.signal?.aborted) throw options.signal.reason
      if (scoped.timedOut()) {
        observation.timedOut = true
        const timeoutError = stableError(
          'PROVIDER_TIMEOUT',
          'The Provider request timed out.',
          true,
          'Retry the request or use a faster model.',
        )
        options.diagnostics?.({
          phase: 'failure',
          method,
          url: safeUrl,
          attempt: attempt + 1,
          durationMs: Math.max(0, options.now() - startedAt),
          code: timeoutError.code,
        })
        throw timeoutError
      }
      observation.networkFailure = true
      const networkError = stableError(
        'PROVIDER_UNAVAILABLE',
        'The app could not reach the Provider.',
        true,
        'Check the network connection and retry.',
      )
      options.diagnostics?.({
        phase: 'failure',
        method,
        url: safeUrl,
        attempt: attempt + 1,
        durationMs: Math.max(0, options.now() - startedAt),
        code: networkError.code,
      })
      throw networkError
    } finally {
      scoped.cleanup()
    }
  }
}
