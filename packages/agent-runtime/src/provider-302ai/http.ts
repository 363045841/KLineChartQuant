import { AgentRuntimeError } from '../contracts/errors.js'

import type { AgentRuntimeErrorCode } from '../contracts/errors.js'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_MAX_RETRY_DELAY_MS = 60_000

export interface ProviderHttpOptions {
  fetch: typeof globalThis.fetch
  now: () => number
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  timeoutMs?: number
  maxRetries?: number
  maxRetryDelayMs?: number
  signal?: AbortSignal
}

export interface ProviderHttpObservation {
  status?: number
  retryAfterMs?: number
  timedOut: boolean
  malformed: boolean
  networkFailure: boolean
}

interface RequestResult {
  value: unknown
  observation: ProviderHttpObservation
}

function stableError(
  code: AgentRuntimeErrorCode,
  message: string,
  retryable: boolean,
  recommendedAction: string,
): AgentRuntimeError {
  return new AgentRuntimeError(code, message, { retryable, recommendedAction })
}

export function normalize302AiBaseUrl(value: string): string {
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
    throw new AgentRuntimeError('INVALID_PAYLOAD', 'The Provider Base URL cannot contain a query or fragment.')
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString().replace(/\/$/, '')
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000)
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return undefined
  return Math.max(0, at - now)
}

export function providerHttpError(
  status: number,
  retryAfterMs?: number,
): AgentRuntimeError {
  switch (status) {
    case 401:
      return stableError(
        'PROVIDER_AUTHENTICATION',
        '302.ai rejected the API credential.',
        false,
        'Check the API key and test the connection again.',
      )
    case 403:
      return stableError(
        'PROVIDER_PERMISSION',
        '302.ai denied access to this resource.',
        false,
        'Check the credential permissions or account access.',
      )
    case 404:
      return stableError(
        'PROVIDER_MODEL_NOT_FOUND',
        'The selected 302.ai model is unavailable.',
        false,
        'Refresh the model list and select another model.',
      )
    case 429: {
      const wait = retryAfterMs === undefined ? '' : ` Retry after ${Math.ceil(retryAfterMs / 1_000)} seconds.`
      return stableError(
        'PROVIDER_RATE_LIMITED',
        `302.ai rate-limited the request.${wait}`,
        true,
        'Wait for the retry window or select another model.',
      )
    }
    default:
      if (status >= 500) {
        return stableError(
          'PROVIDER_UNAVAILABLE',
          '302.ai is temporarily unavailable.',
          true,
          'Retry later or select another model.',
        )
      }
      return stableError(
        'PROVIDER_ERROR',
        'The 302.ai request was rejected.',
        false,
        'Review the Provider configuration and retry.',
      )
  }
}

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

export const sleepWithSignal = defaultSleep

function requestSignal(parent: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal
  timedOut: () => boolean
  cleanup: () => void
} {
  const controller = new AbortController()
  let timeout = false
  const abortFromParent = () => controller.abort(parent?.reason)
  if (parent?.aborted) abortFromParent()
  else parent?.addEventListener('abort', abortFromParent, { once: true })
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

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500
}

export async function requestProviderJson(
  url: string,
  init: RequestInit,
  options: ProviderHttpOptions,
): Promise<RequestResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  const maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS
  let attempt = 0

  while (true) {
    options.signal?.throwIfAborted()
    const scoped = requestSignal(options.signal, timeoutMs)
    const observation: ProviderHttpObservation = {
      timedOut: false,
      malformed: false,
      networkFailure: false,
    }
    try {
      const response = await options.fetch(url, { ...init, signal: scoped.signal })
      observation.status = response.status
      observation.retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), options.now())
      if (!response.ok) {
        const retryDelay = Math.min(observation.retryAfterMs ?? 0, maxRetryDelayMs)
        if (attempt < maxRetries && shouldRetry(response.status)) {
          attempt += 1
          await options.sleep(retryDelay, options.signal)
          continue
        }
        throw providerHttpError(response.status, observation.retryAfterMs)
      }
      try {
        return { value: await response.json(), observation }
      } catch {
        observation.malformed = true
        throw stableError(
          'PROVIDER_MALFORMED_RESPONSE',
          '302.ai returned malformed JSON.',
          true,
          'Retry the request or select another model.',
        )
      }
    } catch (error) {
      if (error instanceof AgentRuntimeError) throw error
      if (options.signal?.aborted) throw options.signal.reason
      if (scoped.timedOut()) {
        observation.timedOut = true
        throw stableError(
          'PROVIDER_TIMEOUT',
          'The 302.ai request timed out.',
          true,
          'Retry the request or use a faster model.',
        )
      }
      observation.networkFailure = true
      throw stableError(
        'PROVIDER_UNAVAILABLE',
        'The app could not reach 302.ai.',
        true,
        'Check the network connection and retry.',
      )
    } finally {
      scoped.cleanup()
    }
  }
}
