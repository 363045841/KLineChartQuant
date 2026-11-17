// OpenAI-compatible Provider 测试：HTTP 边界、诊断、连接验证与运行计划构造。
import type { FetchFunction } from '@earendil-works/pi-ai'
import { Type } from 'typebox'
import { describe, expect, it, vi } from 'vitest'
import {
  AgentRuntimeError,
  createOpenAiCompatibleRuntimeSupport,
  InMemoryProviderCredentialStore,
  InMemoryProviderSettingsStore,
  normalizeProviderBaseUrl,
  type OpenAiCompatibleProviderSettings,
  type ProviderApiProtocol,
  type ProviderDiagnostic,
  parseRetryAfter,
  type RuntimeToolDefinition,
  requestProviderJson,
} from '../index'

const secret = 'temporary-provider-credential'
const baseUrl = 'https://models.example.test/v1'

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function configuredStores() {
  return {
    credentials: new InMemoryProviderCredentialStore(),
    settings: new InMemoryProviderSettingsStore(),
  }
}

/** 模拟模型目录与两种协议的工具探测响应。 */
function providerFetch(options: { invalidTool?: boolean; protocol?: ProviderApiProtocol } = {}) {
  const protocol = options.protocol ?? 'openai-completions'
  return vi.fn<FetchFunction>(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/models')) {
      return json({ object: 'list', data: [{ id: 'frontier-fast', name: 'Frontier Fast' }] })
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    if (protocol === 'openai-completions' && url.endsWith('/chat/completions')) {
      const tool = body.tools as
        | { function: { name: string; parameters: { properties: { nonce: { const: string } } } } }[]
        | undefined
      if (!tool?.[0]) return json({ choices: [{ message: { role: 'assistant', content: 'OK' } }] })
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
                    name: options.invalidTool ? 'wrong_tool' : tool[0].function.name,
                    arguments: JSON.stringify({
                      nonce: tool[0].function.parameters.properties.nonce.const,
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
      const tool = body.tools as
        | { name: string; parameters: { properties: { nonce: { const: string } } } }[]
        | undefined
      if (!tool?.[0]) {
        return json({
          output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }],
        })
      }
      return json({
        output: [
          {
            type: 'function_call',
            name: options.invalidTool ? 'wrong_tool' : tool[0].name,
            arguments: JSON.stringify({ nonce: tool[0].parameters.properties.nonce.const }),
          },
        ],
      })
    }
    return new Response('', { status: 404 })
  })
}

/** 写入一份已验证通过的 Provider 设置。 */
async function configure(
  credentials: InMemoryProviderCredentialStore,
  settings: InMemoryProviderSettingsStore,
  protocol: ProviderApiProtocol = 'openai-completions',
): Promise<OpenAiCompatibleProviderSettings> {
  const value: OpenAiCompatibleProviderSettings = {
    version: 4,
    baseUrl,
    headers: {},
    modelId: 'frontier-fast',
    modelName: 'Frontier Fast',
    contextWindow: 32_768,
    maxOutputTokens: 16_384,
    reasoningEfforts: [],
    protocol,
    compatibility: 'compatible',
    lastTestedAt: 10,
    lastModelsRefreshAt: 9,
  }
  await credentials.write(secret)
  await settings.write(value)
  return value
}

/** 构造一个只用于计划断言的最简工具定义。 */
function tool(name: string, effect: RuntimeToolDefinition['effect']): RuntimeToolDefinition {
  return {
    name,
    label: name,
    description: name,
    parameters: Type.Object({}),
    effect,
    executionMode: effect === 'read' ? 'parallel' : 'sequential',
    async execute() {
      return { content: name, summary: name }
    },
  }
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
  ])('maps HTTP %i to %s and preserves the Provider error fields', async (status, code) => {
    const response = json(
      {
        error: {
          message: 'Provider returned error',
          code: status,
          metadata: { raw: 'temporarily rate-limited upstream', ignored: secret },
        },
      },
      status,
    )
    const fetch = vi.fn<FetchFunction>(async () => response)
    await expect(
      requestProviderJson(
        'https://example.test',
        {},
        { fetch, now: () => 0, sleep: async () => undefined, maxRetries: 0 },
      ),
    ).rejects.toMatchObject({
      code,
      message: 'Provider returned error',
      providerCode: String(status),
      raw: 'temporarily rate-limited upstream',
    })
    expect(response.bodyUsed).toBe(true)
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
      { fetch, now: () => 1_000, sleep, maxRetries: 1 },
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
        { fetch: hanging, now: Date.now, sleep: async () => undefined, timeoutMs: 5 },
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

  it('emits request, response, and failure diagnostics without credentials', async () => {
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
        expect.objectContaining({ phase: 'request', url: 'https://example.test/v1' }),
        expect.objectContaining({
          phase: 'response',
          status: 200,
          contentType: 'application/json',
        }),
        expect.objectContaining({
          phase: 'failure',
          code: 'PROVIDER_MALFORMED_RESPONSE',
          stage: 'tool',
        }),
        expect.objectContaining({ phase: 'failure', code: 'PROVIDER_UNAVAILABLE' }),
      ]),
    )
    expect(JSON.stringify(diagnostics)).not.toContain('secret')
    expect(JSON.stringify(diagnostics)).not.toContain('user:pass')
  })
})

describe('OpenAI-compatible runtime support', () => {
  it('builds a run plan from verified settings and injects the frozen context', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const support = createOpenAiCompatibleRuntimeSupport({
      credentials,
      settings,
      fetch: providerFetch(),
      now: () => Date.UTC(2026, 10, 17, 1, 0, 0),
      tools: () => [tool('chart.read', 'read')],
    })
    const plan = await support.createPlan({
      sessionId: '1',
      prompt: 'Inspect',
      mode: 'plan',
      context: {
        items: [{ kind: 'chart-symbol', value: { symbol: 'BTCUSDT', name: null } }],
      },
    })

    expect(plan.model.id).toBe('frontier-fast')
    expect(plan.streamOptions).toBeDefined()
    expect(plan.systemPrompt).toContain('2026-11-17')
    expect(plan.systemPrompt).toContain('BTCUSDT')
    expect(plan.systemPrompt).toContain('ask_user')
  })

  it('rejects runs before network access when settings are not verified', async () => {
    const { credentials, settings } = configuredStores()
    await credentials.write(secret)
    const support = createOpenAiCompatibleRuntimeSupport({
      credentials,
      settings,
      fetch: providerFetch(),
    })
    await expect(
      support.createPlan({ sessionId: '1', prompt: 'Inspect', mode: 'plan' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' })
  })

  it('derives the capability sentence from the offered tools, not from the mode', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const support = createOpenAiCompatibleRuntimeSupport({
      credentials,
      settings,
      fetch: providerFetch(),
      tools: (input) =>
        input.mode === 'plan'
          ? [tool('chart.read', 'read')]
          : [tool('chart.read', 'read'), tool('chart.write', 'write')],
    })

    const planMode = await support.createPlan({ sessionId: '1', prompt: 'x', mode: 'plan' })
    expect(planMode.tools.map((item) => item.name)).toEqual(['chart.read'])
    expect(planMode.systemPrompt).toContain('Only read-only tools are available')

    const buildMode = await support.createPlan({ sessionId: '1', prompt: 'x', mode: 'build' })
    expect(buildMode.tools.map((item) => item.name)).toEqual(['chart.read', 'chart.write'])
    expect(buildMode.systemPrompt).toContain('You may change the chart through the write tools')
  })

  it('discovers models, passes every probe, and persists the verified configuration', async () => {
    const { credentials, settings } = configuredStores()
    const support = createOpenAiCompatibleRuntimeSupport({
      credentials,
      settings,
      fetch: providerFetch(),
    })
    await credentials.write(secret)

    const catalog = await support.provider.listModels({
      baseUrl,
      apiKey: secret,
      protocol: 'openai-completions',
    })
    expect(catalog.models.map((model) => model.id)).toEqual(['frontier-fast'])

    const tested = await support.provider.test({
      baseUrl,
      apiKey: secret,
      model: 'frontier-fast',
      protocol: 'openai-completions',
    })
    expect(tested.compatible).toBe(true)
    expect(tested.stages.map((stage) => stage.stage)).toEqual(['catalog', 'text', 'tool'])
    expect((await settings.read())?.compatibility).toBe('compatible')
  })

  it('keeps the previous configuration when a protocol tool probe fails', async () => {
    const { credentials, settings } = configuredStores()
    const previous = await configure(credentials, settings)
    const support = createOpenAiCompatibleRuntimeSupport({
      credentials,
      settings,
      fetch: providerFetch({ invalidTool: true }),
    })
    await expect(
      support.provider.test({
        baseUrl,
        apiKey: secret,
        model: 'frontier-fast',
        protocol: 'openai-completions',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_INCOMPATIBLE_TOOLS' })
    expect(await settings.read()).toEqual(previous)
  })

  it('blocks subsequent runs after the credential is deleted', async () => {
    const { credentials, settings } = configuredStores()
    await configure(credentials, settings)
    const support = createOpenAiCompatibleRuntimeSupport({
      credentials,
      settings,
      fetch: providerFetch(),
    })
    await support.provider.deleteCredential()
    await expect(
      support.createPlan({ sessionId: '1', prompt: 'x', mode: 'plan' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' })
  })
})
