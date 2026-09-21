import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AgentRuntimeError,
  fetchOpenAiCompatibleModels,
  parseProviderModelCatalog,
  providerModelView,
} from '../index'

const baseUrl = 'https://models.example.test/v1'

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('fetchOpenAiCompatibleModels', () => {
  it('requests /models with the normalized base URL and bearer credential', async () => {
    const fetchImplementation = vi.fn(async () =>
      json({ data: [{ id: 'model-b' }, { id: 'model-a', name: 'Model A' }] }),
    )
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)

    const result = await fetchOpenAiCompatibleModels(
      {
        baseUrl: `${baseUrl}/`,
        apiKey: '  temporary-provider-credential  ',
        headers: { 'x-tenant': 'alpha' },
        protocol: 'openai-completions',
      },
      fetchImplementation as unknown as typeof fetch,
    )

    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${baseUrl}/models`)
    expect(init.headers).toEqual({
      'x-tenant': 'alpha',
      Accept: 'application/json',
      Authorization: 'Bearer temporary-provider-credential',
    })
    expect(result.refreshedAt).toBe(1_700_000_000_000)
    expect(result.models).toEqual([
      { id: 'model-a', name: 'Model A', compatibility: 'unknown' },
      { id: 'model-b', name: 'model-b', compatibility: 'unknown' },
    ])
  })

  it('omits the Authorization header when no API key is provided', async () => {
    const fetchImplementation = vi.fn(async () => json({ data: [{ id: 'model-a' }] }))
    await fetchOpenAiCompatibleModels(
      { baseUrl, apiKey: '   ', protocol: 'openai-completions' },
      fetchImplementation as unknown as typeof fetch,
    )
    const [, init] = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.headers).toEqual({ Accept: 'application/json' })
  })

  it('rejects an invalid base URL before issuing a request', async () => {
    const fetchImplementation = vi.fn(async () => json({ data: [] }))
    await expect(
      fetchOpenAiCompatibleModels(
        { baseUrl: 'ftp://models.example.test', protocol: 'openai-completions' },
        fetchImplementation as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('maps a 401 response to a provider authentication error with the provider message', async () => {
    const fetchImplementation = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'bad key', code: 'invalid_api_key' } }), {
          status: 401,
        }),
    )
    await expect(
      fetchOpenAiCompatibleModels(
        { baseUrl, protocol: 'openai-completions' },
        fetchImplementation as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      code: 'PROVIDER_AUTHENTICATION',
      message: 'bad key',
      providerCode: 'invalid_api_key',
    })
  })

  it('maps a 500 response to a retryable provider unavailable error', async () => {
    const fetchImplementation = vi.fn(async () => new Response('upstream down', { status: 503 }))
    await expect(
      fetchOpenAiCompatibleModels(
        { baseUrl, protocol: 'openai-responses' },
        fetchImplementation as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: true })
  })

  it('reports a malformed catalog when the body is not valid JSON', async () => {
    const fetchImplementation = vi.fn(async () => new Response('<html>hi</html>', { status: 200 }))
    await expect(
      fetchOpenAiCompatibleModels(
        { baseUrl, protocol: 'openai-completions' },
        fetchImplementation as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({
      code: 'PROVIDER_MALFORMED_RESPONSE',
      message: 'The Provider returned an invalid model catalog.',
    })
  })

  it('reports a malformed catalog when the payload has no usable models', async () => {
    const fetchImplementation = vi.fn(async () => json({ data: [{ nope: true }] }))
    const error = await fetchOpenAiCompatibleModels(
      { baseUrl, protocol: 'openai-completions' },
      fetchImplementation as unknown as typeof fetch,
    ).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(AgentRuntimeError)
    expect((error as AgentRuntimeError).code).toBe('PROVIDER_MALFORMED_RESPONSE')
  })
})

describe('parseProviderModelCatalog', () => {
  it('rejects payloads without a data array', () => {
    expect(() => parseProviderModelCatalog(undefined)).toThrow(TypeError)
    expect(() => parseProviderModelCatalog({ data: 'models' })).toThrow(TypeError)
    expect(() => parseProviderModelCatalog([{ id: 'model-a' }])).toThrow(TypeError)
  })

  it('rejects a catalog whose entries are all unusable', () => {
    expect(() =>
      parseProviderModelCatalog({
        data: [null, 'model-a', { id: 7 }, { id: '   ' }, { id: 'x'.repeat(257) }],
      }),
    ).toThrow('The Provider returned an empty model catalog.')
  })

  it('prefers top_provider capacities and falls back to the flat context_length', () => {
    const models = parseProviderModelCatalog({
      data: [
        {
          id: 'nested',
          context_length: 8_000,
          top_provider: { context_length: 128_000, max_completion_tokens: 4_096 },
        },
        { id: 'flat', context_length: 32_000, top_provider: { context_length: 0 } },
      ],
    })
    const nested = models.find((model) => model.id === 'nested')!
    const flat = models.find((model) => model.id === 'flat')!
    expect(nested).toMatchObject({ contextWindow: 128_000, maxOutputTokens: 4_096 })
    expect(flat.contextWindow).toBe(32_000)
    expect(flat.maxOutputTokens).toBeUndefined()
  })

  it('drops non-positive and fractional capacities', () => {
    const model = parseProviderModelCatalog({
      data: [{ id: 'model-a', context_length: 1.5, top_provider: { max_completion_tokens: -1 } }],
    })[0]!
    expect(model.contextWindow).toBeUndefined()
    expect(model.maxOutputTokens).toBeUndefined()
  })

  it('keeps reasoning efforts in canonical order and validates the declared default', () => {
    const catalog = parseProviderModelCatalog({
      data: [
        { id: 'a-ordered', reasoning: { supported_efforts: ['low', 'high'], default_effort: 'high' } },
        { id: 'b-unknown', reasoning: { supported_efforts: ['low'], default_effort: 'high' } },
        { id: 'c-none', reasoning: { supported_efforts: 'low' } },
      ],
    })
    const [ordered, unknownDefault, noEfforts] = catalog as [
      (typeof catalog)[number],
      (typeof catalog)[number],
      (typeof catalog)[number],
    ]
    expect(ordered.reasoningEfforts).toEqual(['high', 'low'])
    expect(ordered.defaultReasoningEffort).toBe('high')
    expect(unknownDefault.defaultReasoningEffort).toBeUndefined()
    expect(noEfforts.reasoningEfforts).toEqual([])
  })

  it('deduplicates ids, keeping the last entry, and sorts by id', () => {
    const models = parseProviderModelCatalog({
      data: [
        { id: 'zebra', name: 'first zebra' },
        { id: 'alpha' },
        { id: 'zebra', name: 'second zebra' },
      ],
    })
    expect(models.map((model) => model.id)).toEqual(['zebra', 'alpha'].sort())
    expect(models.find((model) => model.id === 'zebra')?.name).toBe('second zebra')
  })

  it('truncates overlong names and caps the catalog at 2000 models', () => {
    const truncated = parseProviderModelCatalog({
      data: [{ id: 'model-a', name: 'n'.repeat(300) }],
    })[0]!
    expect(truncated.name).toHaveLength(256)

    const many = parseProviderModelCatalog({
      data: Array.from({ length: 2_500 }, (_, index) => ({ id: `model-${index}` })),
    })
    expect(many).toHaveLength(2_000)
  })
})

describe('providerModelView', () => {
  it('omits every optional field the catalog model does not declare', () => {
    expect(
      providerModelView({ id: 'model-a', name: 'Model A', reasoningEfforts: [] }),
    ).toEqual({ id: 'model-a', name: 'Model A', compatibility: 'unknown' })
  })

  it('carries through the declared capacities and reasoning efforts', () => {
    expect(
      providerModelView({
        id: 'model-a',
        name: 'Model A',
        contextWindow: 128_000,
        maxOutputTokens: 4_096,
        reasoningEfforts: ['high'],
        defaultReasoningEffort: 'high',
      }),
    ).toEqual({
      id: 'model-a',
      name: 'Model A',
      compatibility: 'unknown',
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
      reasoningEfforts: ['high'],
      defaultReasoningEffort: 'high',
    })
  })
})
