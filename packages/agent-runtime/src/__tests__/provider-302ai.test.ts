import { describe, expect, it, vi } from 'vitest'

import {
  AgentRuntimeError,
  InMemoryProviderCredentialStore,
  InMemoryProviderSettingsStore,
  PiRunDriver,
  create302AiRuntimeSupport,
  normalize302AiBaseUrl,
  parseRetryAfter,
  requestProviderJson,
  type Provider302AiSettings,
} from '../index'

import type { FetchFunction } from '@earendil-works/pi-ai'

const secret = 'temporary-provider-credential'
const baseUrl = 'https://api.302.ai/v1'

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function configuredStores() {
  const credentials = new InMemoryProviderCredentialStore({ persistenceMode: 'encrypted' })
  const settings = new InMemoryProviderSettingsStore()
  return { credentials, settings }
}

function providerFetch(options: { invalidTool?: boolean } = {}): FetchFunction {
  return vi.fn(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/models')) {
      return json({ object: 'list', data: [{ id: 'frontier-fast', name: 'Frontier Fast' }] })
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    if (Array.isArray(body.tools)) {
      const tool = body.tools[0] as {
        function: {
          name: string
          parameters: { properties: { nonce: { const: string } } }
        }
      }
      return json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'probe-1',
                  type: 'function',
                  function: {
                    name: options.invalidTool ? 'wrong_tool' : tool.function.name,
                    arguments: JSON.stringify({
                      nonce: tool.function.parameters.properties.nonce.const,
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
    }
    return json({ choices: [{ message: { role: 'assistant', content: 'OK' } }] })
  })
}

async function configure(
  credentials: InMemoryProviderCredentialStore,
  settings: InMemoryProviderSettingsStore,
): Promise<void> {
  await credentials.write(secret)
  await settings.write({
    version: 1,
    baseUrl,
    modelId: 'frontier-fast',
    modelName: 'Frontier Fast',
    compatibility: 'compatible',
    lastTestedAt: 10,
    lastModelsRefreshAt: 9,
  })
}

describe('302.ai Provider HTTP boundary', () => {
  it('normalizes valid endpoints and rejects credentials, queries, and non-HTTP URLs', () => {
    expect(normalize302AiBaseUrl('https://api.302.ai/v1///')).toBe(baseUrl)
    expect(() => normalize302AiBaseUrl('file:///tmp/provider')).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeError>>({ code: 'INVALID_PAYLOAD' }),
    )
    expect(() => normalize302AiBaseUrl('https://user:pass@example.test/v1')).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeError>>({ code: 'INVALID_PAYLOAD' }),
    )
    expect(() => normalize302AiBaseUrl('https://example.test/v1?key=value')).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeError>>({ code: 'INVALID_PAYLOAD' }),
    )
  })

  it('parses delta-seconds and HTTP-date Retry-After values', () => {
    expect(parseRetryAfter('2', 1_000)).toBe(2_000)
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:00:03 GMT', 1_000)).toBe(2_000)
    expect(parseRetryAfter('not-a-date', 1_000)).toBeUndefined()
  })

  it.each([
    [401, 'PROVIDER_AUTHENTICATION'],
    [403, 'PROVIDER_PERMISSION'],
    [404, 'PROVIDER_MODEL_NOT_FOUND'],
    [429, 'PROVIDER_RATE_LIMITED'],
    [503, 'PROVIDER_UNAVAILABLE'],
  ])('maps HTTP %i to %s without consuming the response body', async (status, code) => {
    const response = new Response(secret, { status })
    const fetch = vi.fn(async () => response)
    await expect(
      requestProviderJson('https://example.test', {}, {
        fetch,
        now: () => 0,
        sleep: async () => undefined,
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ code })
    expect(response.bodyUsed).toBe(false)
  })

  it('respects Retry-After before a bounded retry', async () => {
    const fetch = vi
      .fn<FetchFunction>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(json({ ok: true }))
    const sleep = vi.fn(async () => undefined)
    const result = await requestProviderJson('https://example.test', {}, {
      fetch,
      now: () => 1_000,
      sleep,
      maxRetries: 1,
    })
    expect(result.value).toEqual({ ok: true })
    expect(sleep).toHaveBeenCalledWith(2_000, undefined)
  })

  it('maps request timeout and malformed JSON without relaying upstream data', async () => {
    const hanging: FetchFunction = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })
    await expect(
      requestProviderJson('https://example.test', {}, {
        fetch: hanging,
        now: Date.now,
        sleep: async () => undefined,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' })

    await expect(
      requestProviderJson('https://example.test', {}, {
        fetch: async () => new Response(`{"secret":"${secret}"`, { status: 200 }),
        now: Date.now,
        sleep: async () => undefined,
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_MALFORMED_RESPONSE',
      message: '302.ai returned malformed JSON.',
    })
  })
})

describe('302.ai runtime support', () => {
  it('discovers models, passes all probes, and persists only the successful configuration', async () => {
    const { credentials, settings } = configuredStores()
    let currentTime = 100
    const support = create302AiRuntimeSupport({
      credentials,
      settings,
      fetch: providerFetch(),
      now: () => ++currentTime,
      sleep: async () => undefined,
    })

    const discovered = await support.provider.listModels({ baseUrl, apiKey: secret })
    expect(discovered.models).toEqual([
      { id: 'frontier-fast', name: 'Frontier Fast', compatibility: 'unknown' },
    ])
    const result = await support.provider.test({ baseUrl, apiKey: secret, model: 'frontier-fast' })
    expect(result).toMatchObject({
      compatible: true,
      model: 'frontier-fast',
      stages: [
        { stage: 'catalog', ok: true },
        { stage: 'text', ok: true },
        { stage: 'tool', ok: true },
      ],
    })
    expect(await credentials.read()).toBe(secret)
    expect(await settings.read()).toMatchObject<Partial<Provider302AiSettings>>({
      baseUrl,
      modelId: 'frontier-fast',
      compatibility: 'compatible',
    })
    const status = await support.provider.getStatus()
    expect(status).toMatchObject({
      state: 'connected',
      configured: true,
      persistenceMode: 'encrypted',
      compatibility: 'compatible',
      modelId: 'frontier-fast',
    })
    expect(JSON.stringify(status)).not.toContain(secret)
    expect(status.fingerprint).toMatch(/^sha256:[0-9a-f]{12}$/)
  })

  it('does not replace a last-known-good credential when the tool probe fails', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const support = create302AiRuntimeSupport({
      credentials,
      settings,
      fetch: providerFetch({ invalidTool: true }),
      sleep: async () => undefined,
    })

    await expect(
      support.provider.test({ baseUrl, apiKey: 'replacement-credential', model: 'frontier-fast' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_INCOMPATIBLE_TOOLS' })
    expect(await credentials.read()).toBe(secret)
    expect(await settings.read()).toMatchObject({ modelId: 'frontier-fast' })
    const status = await support.provider.getStatus()
    expect(status.state).toBe('error')
    expect(JSON.stringify(status)).not.toContain('replacement-credential')
  })

  it('deletes only the credential and blocks subsequent runs before network access', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const fetch = providerFetch()
    const support = create302AiRuntimeSupport({ credentials, settings, fetch })
    await support.provider.deleteCredential()
    await expect(
      support.createPlan({
        sessionId: 'session-1',
        runId: 'run-1',
        turnId: 'turn-1',
        lane: 'main',
        prompt: 'Hello',
        readOnly: true,
        startedAt: 1,
        userEntryId: 'user-1',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' })
    expect(fetch).not.toHaveBeenCalled()
    expect(await settings.read()).toMatchObject({ modelId: 'frontier-fast' })
  })

  it('streams real OpenAI-compatible SSE through Pi with no scripted tools', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const fetch = vi.fn<FetchFunction>(async () => {
      const stream = [
        'data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"frontier-fast","choices":[{"index":0,"delta":{"role":"assistant","content":"Real "},"finish_reason":null}]}',
        '',
        'data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"frontier-fast","choices":[{"index":0,"delta":{"content":"response"},"finish_reason":null}]}',
        '',
        'data: {"id":"chat-1","object":"chat.completion.chunk","created":1,"model":"frontier-fast","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n')
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    })
    const support = create302AiRuntimeSupport({ credentials, settings, fetch })
    const plan = await support.createPlan({
      sessionId: 'session-1',
      runId: 'run-1',
      turnId: 'turn-1',
      lane: 'main',
      prompt: 'Say hello',
      readOnly: true,
      startedAt: 1,
      userEntryId: 'user-1',
    })
    const deltas: string[] = []
    const result = await new PiRunDriver().run(plan, (event) => {
      if (event.type === 'assistant.text.delta') deltas.push(event.delta)
    })
    expect(plan.tools).toEqual([])
    expect(result.text).toBe('Real response')
    expect(deltas.join('')).toBe('Real response')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('projects streamed HTTP failures to stable errors without raw bodies', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const support = create302AiRuntimeSupport({
      credentials,
      settings,
      fetch: async () => new Response(secret, { status: 401 }),
      maxRetries: 0,
    })
    const plan = await support.createPlan({
      sessionId: 'session-1',
      runId: 'run-1',
      turnId: 'turn-1',
      lane: 'main',
      prompt: 'Hello',
      readOnly: true,
      startedAt: 1,
      userEntryId: 'user-1',
    })
    await expect(new PiRunDriver().run(plan, () => undefined)).rejects.toMatchObject({
      code: 'PROVIDER_AUTHENTICATION',
      message: '302.ai rejected the API credential.',
    })
  })

  it('returns a safe removable error status when persisted settings are corrupt', async () => {
    const credentials = new InMemoryProviderCredentialStore({ persistenceMode: 'encrypted' })
    await credentials.write(secret)
    const support = create302AiRuntimeSupport({
      credentials,
      settings: {
        read: async () => {
          throw new Error(`corrupt settings near ${secret}`)
        },
        write: async () => undefined,
      },
      fetch: providerFetch(),
    })
    const status = await support.provider.getStatus()
    expect(status).toMatchObject({
      state: 'error',
      configured: true,
      error: { code: 'PROVIDER_ERROR', message: 'The 302.ai operation failed.' },
    })
    expect(JSON.stringify(status)).not.toContain(secret)
  })
})
