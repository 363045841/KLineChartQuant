// 覆盖 Provider HTTP 层的状态码分类、错误体解析、脱敏与重试/超时/取消路径。
import { describe, expect, it, vi } from 'vitest'

import {
  normalizeProviderBaseUrl,
  parseRetryAfter,
  providerHttpError,
  requestProviderJson,
  sleepWithSignal,
  type ProviderDiagnostic,
} from '../index'
import {
  parseProviderErrorDetails,
  redactProviderUrl,
} from '../provider-openai-compatible/http.js'

const url = 'https://models.example.test/v1/chat/completions'

function httpOptions(overrides: Partial<Parameters<typeof requestProviderJson>[2]> = {}) {
  return {
    fetch: vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
    now: () => 1_000,
    sleep: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('normalizeProviderBaseUrl', () => {
  it('keeps the path and strips trailing slashes', () => {
    expect(normalizeProviderBaseUrl('  https://models.example.test/v1//  ')).toBe(
      'https://models.example.test/v1',
    )
  })

  it('collapses a root-only path to the bare origin', () => {
    expect(normalizeProviderBaseUrl('https://models.example.test/')).toBe(
      'https://models.example.test',
    )
  })

  it('rejects unparsable values, non-http protocols, credentials, queries and fragments', () => {
    expect(() => normalizeProviderBaseUrl('not a url')).toThrowError(
      'The Provider Base URL is invalid.',
    )
    expect(() => normalizeProviderBaseUrl('ws://models.example.test')).toThrowError(
      'The Provider Base URL is invalid.',
    )
    expect(() => normalizeProviderBaseUrl('https://user@models.example.test/v1')).toThrowError(
      'The Provider Base URL is invalid.',
    )
    expect(() => normalizeProviderBaseUrl('https://:pass@models.example.test/v1')).toThrowError(
      'The Provider Base URL is invalid.',
    )
    expect(() => normalizeProviderBaseUrl('https://models.example.test/v1#frag')).toThrowError(
      'The Provider Base URL cannot contain a query or fragment.',
    )
  })
})

describe('parseRetryAfter', () => {
  it('accepts a zero-second delay', () => {
    expect(parseRetryAfter('0', 1_000)).toBe(0)
  })

  // 已知缺陷：负秒数没有被直接拒绝，而是落到 Date.parse 分支被当成 HTTP 日期。
  // 在真实时钟下结果被 Math.max(0, ...) 夹到 0，因此对调用方无害；此处固定当前行为，
  // 一旦实现改为直接返回 undefined，本断言会失败并提醒同步修改。
  it('does not reject a negative delay outright but clamps it to zero under a real clock', () => {
    expect(parseRetryAfter('-5', Date.now())).toBe(0)
  })

  it('returns undefined for an absent header', () => {
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('')).toBeUndefined()
  })

  it('clamps a past HTTP date to zero', () => {
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:01 GMT', 10_000)).toBe(0)
  })

  it('rounds fractional seconds to whole milliseconds', () => {
    expect(parseRetryAfter('1.5')).toBe(1_500)
  })
})

describe('providerHttpError', () => {
  const cases: ReadonlyArray<readonly [number, string, boolean]> = [
    [401, 'PROVIDER_AUTHENTICATION', false],
    [403, 'PROVIDER_PERMISSION', false],
    [404, 'PROVIDER_MODEL_NOT_FOUND', false],
    [429, 'PROVIDER_RATE_LIMITED', true],
    [500, 'PROVIDER_UNAVAILABLE', true],
    [503, 'PROVIDER_UNAVAILABLE', true],
    [400, 'PROVIDER_ERROR', false],
    [418, 'PROVIDER_ERROR', false],
  ]

  for (const [status, code, retryable] of cases) {
    it(`maps ${status} to ${code}`, () => {
      const error = providerHttpError(status)
      expect(error.code).toBe(code)
      expect(error.retryable).toBe(retryable)
      expect(error.providerCode).toBe(String(status))
    })
  }

  it('renders the retry window in the 429 message and rounds up to whole seconds', () => {
    expect(providerHttpError(429, 2_400).message).toBe(
      'The Provider rate-limited the request. Retry after 3 seconds.',
    )
    expect(providerHttpError(429).message).toBe('The Provider rate-limited the request.')
  })

  it('prefers the provider message, code and raw payload when present', () => {
    const error = providerHttpError(500, undefined, {
      message: 'upstream on fire',
      code: 'upstream_error',
      raw: '{"detail":"boom"}',
    })
    expect(error.message).toBe('upstream on fire')
    expect(error.providerCode).toBe('upstream_error')
    expect(error.raw).toBe('{"detail":"boom"}')
  })
})

describe('parseProviderErrorDetails', () => {
  it('returns undefined for bodies that carry no usable error fields', () => {
    expect(parseProviderErrorDetails('not json')).toBeUndefined()
    expect(parseProviderErrorDetails('"a string"')).toBeUndefined()
    expect(parseProviderErrorDetails('[1,2]')).toBeUndefined()
    expect(parseProviderErrorDetails('null')).toBeUndefined()
    expect(parseProviderErrorDetails('{}')).toBeUndefined()
    expect(parseProviderErrorDetails('{"error":"boom"}')).toBeUndefined()
    expect(parseProviderErrorDetails('{"error":[1]}')).toBeUndefined()
    expect(parseProviderErrorDetails('{"error":null}')).toBeUndefined()
    expect(parseProviderErrorDetails('{"error":{"status":500}}')).toBeUndefined()
  })

  it('stringifies a numeric provider code', () => {
    expect(parseProviderErrorDetails('{"error":{"code":429}}')).toEqual({
      message: undefined,
      code: '429',
      raw: undefined,
    })
  })

  it('reads metadata.raw only when it is a string on an object metadata', () => {
    expect(parseProviderErrorDetails('{"error":{"metadata":{"raw":"upstream"}}}')).toEqual({
      message: undefined,
      code: undefined,
      raw: 'upstream',
    })
    expect(
      parseProviderErrorDetails('{"error":{"message":"m","metadata":{"raw":7}}}'),
    ).toEqual({ message: 'm', code: undefined, raw: undefined })
    expect(parseProviderErrorDetails('{"error":{"message":"m","metadata":[1]}}')).toEqual({
      message: 'm',
      code: undefined,
      raw: undefined,
    })
  })
})

describe('redactProviderUrl', () => {
  it('removes credentials, query and fragment', () => {
    expect(
      redactProviderUrl('https://user:pass@models.example.test/v1/chat?key=secret#frag'),
    ).toBe('https://models.example.test/v1/chat')
  })
})

describe('sleepWithSignal', () => {
  it('resolves after the delay when not cancelled', async () => {
    await expect(sleepWithSignal(1)).resolves.toBeUndefined()
  })

  it('rejects immediately when the signal is already aborted', async () => {
    await expect(sleepWithSignal(10_000, AbortSignal.abort(new Error('gone')))).rejects.toThrow(
      'gone',
    )
  })

  it('rejects with the abort reason when cancelled mid-wait', async () => {
    const controller = new AbortController()
    const pending = sleepWithSignal(10_000, controller.signal)
    controller.abort(new Error('cancelled mid-wait'))
    await expect(pending).rejects.toThrow('cancelled mid-wait')
  })
})

describe('requestProviderJson', () => {
  it('reports the malformed body shape in diagnostics for each response flavour', async () => {
    const shapes: ReadonlyArray<readonly [string, ProviderDiagnostic['responseBodyShape']]> = [
      ['', 'empty'],
      ['data: {"x":1}', 'sse'],
      ['<!DOCTYPE html><html>', 'html'],
      ['<html><body>hi</body></html>', 'html'],
      ['{oops', 'json-like'],
      ['[oops', 'json-like'],
      ['plain text failure', 'other'],
    ]
    for (const [body, responseBodyShape] of shapes) {
      const diagnostics: ProviderDiagnostic[] = []
      const options = httpOptions({
        fetch: vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch,
        diagnostics: (diagnostic) => diagnostics.push(diagnostic),
        stage: 'catalog',
      })
      await expect(requestProviderJson(url, {}, options)).rejects.toMatchObject({
        code: 'PROVIDER_MALFORMED_RESPONSE',
        retryable: true,
      })
      const failure = diagnostics.find((diagnostic) => diagnostic.phase === 'failure')
      expect(failure).toMatchObject({
        responseBodyShape,
        responseBodyBytes: new TextEncoder().encode(body).byteLength,
        method: 'GET',
        stage: 'catalog',
      })
    }
  })

  it('caps the server retry hint at maxRetryDelayMs and retries until the cap', async () => {
    const sleep = vi.fn(async (_milliseconds: number, _signal?: AbortSignal) => undefined)
    const fetchImplementation = vi.fn(
      async () => new Response('busy', { status: 429, headers: { 'retry-after': '3600' } }),
    )
    await expect(
      requestProviderJson(
        url,
        { method: 'post' },
        httpOptions({
          fetch: fetchImplementation as unknown as typeof fetch,
          sleep,
          maxRetries: 2,
          maxRetryDelayMs: 1_500,
        }),
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMITED' })
    expect(fetchImplementation).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([1_500, 1_500])
  })

  it('does not retry a non-retryable status even when retries remain', async () => {
    const fetchImplementation = vi.fn(async () => new Response('nope', { status: 400 }))
    await expect(
      requestProviderJson(
        url,
        {},
        httpOptions({ fetch: fetchImplementation as unknown as typeof fetch, maxRetries: 3 }),
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
  })

  it('uses a zero delay when the server sends no retry-after header', async () => {
    const sleep = vi.fn(async () => undefined)
    let call = 0
    const fetchImplementation = vi.fn(async () =>
      (call++ === 0
        ? new Response('busy', { status: 500 })
        : new Response('{"ok":true}', { status: 200 })),
    )
    const result = await requestProviderJson(
      url,
      {},
      httpOptions({ fetch: fetchImplementation as unknown as typeof fetch, sleep, maxRetries: 1 }),
    )
    expect(result.value).toEqual({ ok: true })
    expect(result.observation).toMatchObject({ status: 200, malformed: false, timedOut: false })
    expect(sleep).toHaveBeenCalledWith(0, undefined)
  })

  it('throws the caller abort reason when the signal is already aborted', async () => {
    const fetchImplementation = vi.fn()
    await expect(
      requestProviderJson(
        url,
        {},
        httpOptions({
          fetch: fetchImplementation as unknown as typeof fetch,
          signal: AbortSignal.abort(new Error('caller gone')),
        }),
      ),
    ).rejects.toThrow('caller gone')
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('propagates the caller abort reason rather than a network error', async () => {
    const controller = new AbortController()
    const fetchImplementation = vi.fn(async () => {
      controller.abort(new Error('user cancelled the run'))
      throw new Error('fetch aborted')
    })
    await expect(
      requestProviderJson(
        url,
        {},
        httpOptions({
          fetch: fetchImplementation as unknown as typeof fetch,
          signal: controller.signal,
        }),
      ),
    ).rejects.toThrow('user cancelled the run')
  })

  it('classifies a module timeout separately from a network failure', async () => {
    const diagnostics: ProviderDiagnostic[] = []
    const fetchImplementation = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
        }),
    )
    await expect(
      requestProviderJson(
        url,
        {},
        httpOptions({
          fetch: fetchImplementation as unknown as typeof fetch,
          timeoutMs: 5,
          diagnostics: (diagnostic) => diagnostics.push(diagnostic),
        }),
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', retryable: true })
    expect(diagnostics.at(-1)).toMatchObject({ phase: 'failure', code: 'PROVIDER_TIMEOUT' })
  })

  it('classifies a transport rejection as a provider unavailable error', async () => {
    const diagnostics: ProviderDiagnostic[] = []
    await expect(
      requestProviderJson(
        url,
        {},
        httpOptions({
          fetch: vi.fn(async () => {
            throw new TypeError('fetch failed')
          }) as unknown as typeof fetch,
          diagnostics: (diagnostic) => diagnostics.push(diagnostic),
        }),
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: true })
    expect(diagnostics.at(-1)).toMatchObject({ phase: 'failure', code: 'PROVIDER_UNAVAILABLE' })
  })

  it('clamps a backwards clock to a non-negative duration', async () => {
    const diagnostics: ProviderDiagnostic[] = []
    let clock = 5_000
    await requestProviderJson(
      url,
      {},
      httpOptions({
        now: () => (clock -= 1_000),
        diagnostics: (diagnostic) => diagnostics.push(diagnostic),
      }),
    )
    const response = diagnostics.find((diagnostic) => diagnostic.phase === 'response')
    expect(response?.durationMs).toBe(0)
  })
})
