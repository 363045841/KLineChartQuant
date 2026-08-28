import { AgentRuntimeError } from '../contracts/errors.js'

import type { AgentRuntimeErrorCode } from '../contracts/errors.js'
import type { ProviderDiagnostic } from './types.js'

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
  stage?: ProviderDiagnostic['stage']
  diagnostics?: (diagnostic: ProviderDiagnostic) => void
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

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000)
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return undefined
  return Math.max(0, at - now)
}

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

export function redactProviderUrl(value: string): string {
  const url = new URL(value)
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  return url.toString()
}

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
