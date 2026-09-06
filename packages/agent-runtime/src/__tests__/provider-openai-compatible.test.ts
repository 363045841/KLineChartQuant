import { describe, expect, it, vi } from 'vitest'

import {
  AgentRuntimeError,
  InMemoryProviderCredentialStore,
  InMemoryProviderSettingsStore,
  PiRunDriver,
  createOpenAiCompatibleRuntimeSupport,
  normalizeProviderBaseUrl,
  parseOpenAiCompatibleProviderSettings,
  parseRetryAfter,
  requestProviderJson,
  type OpenAiCompatibleProviderSettings,
  type ProviderDiagnostic,
  type ProviderApiProtocol,
} from '../index'

import type { FetchFunction } from '@earendil-works/pi-ai'

const secret = 'temporary-provider-credential'
const baseUrl = 'https://models.example.test/v1'

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function configuredStores() {
  const credentials = new InMemoryProviderCredentialStore()
  const settings = new InMemoryProviderSettingsStore()
  return { credentials, settings }
}

function providerFetch(options: { invalidTool?: boolean; protocol?: ProviderApiProtocol } = {}) {
  const protocol = options.protocol ?? 'openai-completions'
  return vi.fn(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/models')) {
      return json({ object: 'list', data: [{ id: 'frontier-fast', name: 'Frontier Fast' }] })
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    if (protocol === 'openai-completions' && url.endsWith('/chat/completions')) {
      if (!Array.isArray(body.tools)) {
        return json({ choices: [{ message: { role: 'assistant', content: 'OK' } }] })
      }
      const tool = body.tools[0] as {
        function: { name: string; parameters: { properties: { nonce: { const: string } } } }
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
    if (protocol === 'openai-responses' && url.endsWith('/responses')) {
      if (!Array.isArray(body.tools)) {
        return json({
          output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }],
        })
      }
      const tool = body.tools[0] as {
        name: string
        parameters: { properties: { nonce: { const: string } } }
      }
      return json({
        output: [
          {
            type: 'function_call',
            name: options.invalidTool ? 'wrong_tool' : tool.name,
            arguments: JSON.stringify({ nonce: tool.parameters.properties.nonce.const }),
          },
        ],
      })
    }
    return new Response('', { status: 404 })
  })
}

function streamResponse(protocol: ProviderApiProtocol): Response {
  const events =
    protocol === 'openai-completions'
      ? [
          {
            id: 'chat-1',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'frontier-fast',
            choices: [
              { index: 0, delta: { role: 'assistant', content: 'Real ' }, finish_reason: null },
            ],
          },
          {
            id: 'chat-1',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'frontier-fast',
            choices: [{ index: 0, delta: { content: 'response' }, finish_reason: null }],
          },
          {
            id: 'chat-1',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'frontier-fast',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          },
        ]
      : [
          { type: 'response.created', response: { id: 'response-1' } },
          {
            type: 'response.output_item.added',
            output_index: 0,
            item: { id: 'message-1', type: 'message', role: 'assistant', content: [] },
          },
          { type: 'response.output_text.delta', output_index: 0, delta: 'Real ' },
          { type: 'response.output_text.delta', output_index: 0, delta: 'response' },
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              id: 'message-1',
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Real response', annotations: [] }],
            },
          },
          {
            type: 'response.completed',
            response: {
              id: 'response-1',
              status: 'completed',
              output: [],
              usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
            },
          },
        ]
  const stream = [
    ...events.map((event) => `data: ${JSON.stringify(event)}\n`),
    'data: [DONE]\n',
  ].join('\n')
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

async function configure(
  credentials: InMemoryProviderCredentialStore,
  settings: InMemoryProviderSettingsStore,
  protocol: ProviderApiProtocol = 'openai-completions',
): Promise<void> {
  await credentials.write(secret)
  await settings.write({
    version: 2,
    baseUrl,
    modelId: 'frontier-fast',
    modelName: 'Frontier Fast',
    protocol,
    compatibility: 'compatible',
    lastTestedAt: 10,
    lastModelsRefreshAt: 9,
  })
}

describe('OpenAI-compatible Provider HTTP boundary', () => {
  it('normalizes valid endpoints and rejects credentials, queries, and non-HTTP URLs', () => {
    expect(normalizeProviderBaseUrl('https://models.example.test/v1///')).toBe(baseUrl)
    expect(() => normalizeProviderBaseUrl('file:///tmp/provider')).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeError>>({ code: 'INVALID_PAYLOAD' }),
    )
    expect(() => normalizeProviderBaseUrl('https://user:pass@example.test/v1')).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeError>>({ code: 'INVALID_PAYLOAD' }),
    )
    expect(() => normalizeProviderBaseUrl('https://example.test/v1?key=value')).toThrowError(
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
      requestProviderJson(
        'https://example.test',
        {},
        {
          fetch,
          now: () => 0,
          sleep: async () => undefined,
          maxRetries: 0,
        },
      ),
    ).rejects.toMatchObject({ code })
    expect(response.bodyUsed).toBe(false)
  })

  it('respects Retry-After before a bounded retry', async () => {
    const fetch = vi
      .fn<FetchFunction>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(json({ ok: true }))
    const sleep = vi.fn(async () => undefined)
    const result = await requestProviderJson(
      'https://example.test',
      {},
      {
        fetch,
        now: () => 1_000,
        sleep,
        maxRetries: 1,
      },
    )
    expect(result.value).toEqual({ ok: true })
    expect(sleep).toHaveBeenCalledWith(2_000, undefined)
  })

  it('maps request timeout and malformed JSON without relaying upstream data', async () => {
    const hanging: FetchFunction = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })
    await expect(
      requestProviderJson(
        'https://example.test',
        {},
        {
          fetch: hanging,
          now: Date.now,
          sleep: async () => undefined,
          timeoutMs: 5,
        },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' })

    await expect(
      requestProviderJson(
        'https://example.test',
        {},
        {
          fetch: async () => new Response(`{"secret":"${secret}"`, { status: 200 }),
          now: Date.now,
          sleep: async () => undefined,
        },
      ),
    ).rejects.toMatchObject({
      code: 'PROVIDER_MALFORMED_RESPONSE',
      message: 'The Provider returned malformed JSON.',
    })
  })

  it('emits redacted request, response, and failure diagnostics', async () => {
    const diagnostics: ProviderDiagnostic[] = []
    const record = (diagnostic: ProviderDiagnostic) => diagnostics.push(diagnostic)
    await requestProviderJson(
      'https://user:pass@example.test/v1?token=secret#fragment',
      {},
      {
        fetch: async () => json({ ok: true }),
        now: () => 10,
        sleep: async () => undefined,
        diagnostics: record,
      },
    )
    await expect(
      requestProviderJson(
        'https://example.test/v1',
        {},
        {
          fetch: async () => new Response('not-json'),
          now: () => 20,
          sleep: async () => undefined,
          diagnostics: record,
          stage: 'tool',
        },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_MALFORMED_RESPONSE' })
    await expect(
      requestProviderJson(
        'https://offline.example.test/v1',
        {},
        {
          fetch: async () => {
            throw new TypeError('network detail must not be logged')
          },
          now: () => 30,
          sleep: async () => undefined,
          diagnostics: record,
        },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: 'request',
          url: 'https://example.test/v1',
        }),
        expect.objectContaining({
          phase: 'response',
          status: 200,
          contentType: 'application/json',
        }),
        expect.objectContaining({
          phase: 'failure',
          code: 'PROVIDER_MALFORMED_RESPONSE',
          stage: 'tool',
          responseBodyBytes: 8,
          responseBodyShape: 'other',
        }),
        expect.objectContaining({
          phase: 'failure',
          code: 'PROVIDER_UNAVAILABLE',
        }),
      ]),
    )
    expect(JSON.stringify(diagnostics)).not.toContain('secret')
    expect(JSON.stringify(diagnostics)).not.toContain('user:pass')
  })
})

describe('OpenAI-compatible runtime support', () => {
  it.each([
    ['openai-completions', '/chat/completions'],
    ['openai-responses', '/responses'],
  ] as const)(
    'validates and creates a %s run plan through its protocol adapter',
    async (protocol, endpoint) => {
      const { credentials, settings } = configuredStores()
      const fetch = providerFetch({ protocol })
      const support = createOpenAiCompatibleRuntimeSupport({
        credentials,
        settings,
        fetch,
        sleep: async () => undefined,
      })

      const discovered = await support.provider.listModels({ baseUrl, apiKey: secret, protocol })
      expect(discovered.models).toHaveLength(1)
      await expect(
        support.provider.test({ baseUrl, apiKey: secret, model: 'frontier-fast', protocol }),
      ).resolves.toMatchObject({
        compatible: true,
        stages: [{ stage: 'catalog' }, { stage: 'text' }, { stage: 'tool' }],
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

      expect(plan.model.api).toBe(protocol)
      expect(await settings.read()).toMatchObject({ version: 2, protocol })
      expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
        `${baseUrl}/models`,
        `${baseUrl}/models`,
        `${baseUrl}${endpoint}`,
        `${baseUrl}${endpoint}`,
      ])
    },
  )

  it('injects the current Asia/Shanghai date and time into the system prompt', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const support = createOpenAiCompatibleRuntimeSupport({
      credentials,
      settings,
      fetch: providerFetch(),
      now: () => 1_700_000_000_000,
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

    expect(plan.systemPrompt).toContain(
      'Current date and time (Asia/Shanghai): 2023-11-15 06:13:20',
    )
  })

  it('injects the frozen UI context and avoids redundant chart discovery tools', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const support = createOpenAiCompatibleRuntimeSupport({
      credentials,
      settings,
      fetch: providerFetch(),
    })

    const plan = await support.createPlan({
      sessionId: 'session-1',
      runId: 'run-1',
      turnId: 'turn-1',
      lane: 'main',
      prompt: 'Analyze this range.',
      readOnly: true,
      context: {
        items: [
          { kind: 'chart-symbol', value: { symbol: 'BTCUSDT', name: 'Bitcoin / Tether' } },
          {
            kind: 'selected-time-range',
            value: { from: '2023-11-15 06:13', to: '2023-11-16 06:13' },
          },
        ],
      },
      startedAt: 1,
      userEntryId: 'user-1',
    })

    expect(plan.systemPrompt).toContain('"kind":"chart-symbol"')
    expect(plan.systemPrompt).toContain('"kind":"selected-time-range"')
    expect(plan.systemPrompt).toContain('Do not use tools to rediscover the current symbol')
  })

  it('migrates v1 persisted settings to explicit Chat Completions', () => {
    expect(
      parseOpenAiCompatibleProviderSettings({
        version: 1,
        baseUrl,
        modelId: 'frontier-fast',
        modelName: 'Frontier Fast',
        compatibility: 'compatible',
        lastTestedAt: 10,
        lastModelsRefreshAt: 9,
      }),
    ).toEqual({
      version: 2,
      baseUrl,
      modelId: 'frontier-fast',
      modelName: 'Frontier Fast',
      protocol: 'openai-completions',
      compatibility: 'compatible',
      lastTestedAt: 10,
      lastModelsRefreshAt: 9,
    })
  })

  it('discovers models, passes all probes, and persists only the successful configuration', async () => {
    const { credentials, settings } = configuredStores()
    let currentTime = 100
    const support = createOpenAiCompatibleRuntimeSupport({
      credentials,
      settings,
      fetch: providerFetch(),
      now: () => ++currentTime,
      sleep: async () => undefined,
    })

    const discovered = await support.provider.listModels({
      baseUrl,
      apiKey: secret,
      protocol: 'openai-completions',
    })
    expect(discovered.models).toEqual([
      { id: 'frontier-fast', name: 'Frontier Fast', compatibility: 'unknown' },
    ])
    const result = await support.provider.test({
      baseUrl,
      apiKey: secret,
      model: 'frontier-fast',
      protocol: 'openai-completions',
    })
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
    expect(await settings.read()).toMatchObject<Partial<OpenAiCompatibleProviderSettings>>({
      baseUrl,
      modelId: 'frontier-fast',
      protocol: 'openai-completions',
      compatibility: 'compatible',
    })
    const status = await support.provider.getStatus()
    expect(status).toMatchObject({
      state: 'connected',
      configured: true,
      compatibility: 'compatible',
      modelId: 'frontier-fast',
    })
    expect(JSON.stringify(status)).not.toContain(secret)
    expect(status.fingerprint).toMatch(/^sha256:[0-9a-f]{12}$/)
  })

  it('does not replace a working configuration when a protocol tool probe fails', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const fetch = providerFetch({ invalidTool: true })
    const support = createOpenAiCompatibleRuntimeSupport({
      credentials,
      settings,
      fetch,
      sleep: async () => undefined,
    })

    await expect(
      support.provider.test({
        baseUrl,
        apiKey: 'replacement-credential',
        model: 'frontier-fast',
        protocol: 'openai-completions',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_INCOMPATIBLE_TOOLS' })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(String(fetch.mock.calls[0][0])).toBe(`${baseUrl}/models`)
    expect(String(fetch.mock.calls[1][0])).toBe(`${baseUrl}/chat/completions`)
    expect(String(fetch.mock.calls[2][0])).toBe(`${baseUrl}/chat/completions`)
    expect(await credentials.read()).toBe(secret)
    expect(await settings.read()).toMatchObject({
      modelId: 'frontier-fast',
      protocol: 'openai-completions',
    })
    const status = await support.provider.getStatus()
    expect(status.state).toBe('error')
  })

  it('deletes only the credential and blocks subsequent runs before network access', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const fetch = providerFetch()
    const support = createOpenAiCompatibleRuntimeSupport({ credentials, settings, fetch })
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

  it.each(['openai-completions', 'openai-responses'] as const)(
    'streams real %s SSE through Pi with no scripted tools',
    async (protocol) => {
      const { credentials, settings } = configuredStores()
      await configure(credentials, settings, protocol)
      const fetch = vi.fn<FetchFunction>(async () => streamResponse(protocol))
      const support = createOpenAiCompatibleRuntimeSupport({ credentials, settings, fetch })
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
      expect(String(fetch.mock.calls[0][0])).toContain(
        protocol === 'openai-responses' ? '/responses' : '/chat/completions',
      )
    },
  )

  it.each(['openai-completions', 'openai-responses'] as const)(
    'projects %s streamed HTTP failures to stable errors without raw bodies',
    async (protocol) => {
      const { credentials, settings } = configuredStores()
      await configure(credentials, settings, protocol)
      const support = createOpenAiCompatibleRuntimeSupport({
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
        message: 'The Provider rejected the API credential.',
      })
    },
  )

  it('maps a truncated Responses stream to a stable malformed-response error', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings, 'openai-responses')
    const support = createOpenAiCompatibleRuntimeSupport({
      credentials,
      settings,
      fetch: async () =>
        new Response(
          [
            'data: {"type":"response.created","response":{"id":"response-1"}}',
            '',
            'data: [DONE]',
            '',
          ].join('\n'),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
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
      code: 'PROVIDER_MALFORMED_RESPONSE',
    })
  })

  it('returns a safe removable error status when persisted settings are corrupt', async () => {
    const credentials = new InMemoryProviderCredentialStore()
    await credentials.write(secret)
    const support = createOpenAiCompatibleRuntimeSupport({
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
      error: { code: 'PROVIDER_ERROR', message: 'The Provider operation failed.' },
    })
    expect(JSON.stringify(status)).not.toContain(secret)
  })
})
