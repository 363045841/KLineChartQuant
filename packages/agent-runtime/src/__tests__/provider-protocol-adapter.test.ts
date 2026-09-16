// 覆盖两个 OpenAI-compatible 协议适配器的探针校验、模型构造与流错误归一化。
import { describe, expect, it, vi } from 'vitest'

import { getProviderApiProtocolAdapter } from '../provider-openai-compatible/protocol.js'

import type { ProviderStreamObservation } from '../provider-openai-compatible/protocol.js'
import type { AssistantMessage } from '@earendil-works/pi-ai'

const baseUrl = 'https://models.example.test/v1'
const nonce = 'nonce-1'

function probeInput(payload: unknown) {
  const fetchImplementation = vi.fn(
    async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  )
  return {
    fetchImplementation,
    input: {
      baseUrl,
      apiKey: 'temporary-provider-credential',
      modelId: 'model-a',
      nonce,
      http: {
        fetch: fetchImplementation as unknown as typeof fetch,
        now: () => 1_000,
        sleep: async () => undefined,
      },
    },
  }
}

function assistant(errorMessage?: string): AssistantMessage {
  return { role: 'assistant', content: [], errorMessage } as unknown as AssistantMessage
}

const noObservation: ProviderStreamObservation = { networkFailure: false }

describe('getProviderApiProtocolAdapter', () => {
  it('returns the adapter matching the requested protocol', () => {
    expect(getProviderApiProtocolAdapter('openai-completions').protocol).toBe('openai-completions')
    expect(getProviderApiProtocolAdapter('openai-responses').protocol).toBe('openai-responses')
  })

  it('rejects an unknown protocol', () => {
    expect(() =>
      getProviderApiProtocolAdapter('anthropic-messages' as never),
    ).toThrowError('The Provider API protocol is invalid.')
  })
})

describe('openai-completions adapter', () => {
  const adapter = getProviderApiProtocolAdapter('openai-completions')

  it('builds a model with provider capacities and reasoning support', () => {
    const model = adapter.createModel(baseUrl, {
      id: 'model-a',
      name: 'Model A',
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
      reasoningEfforts: ['high'],
    })
    expect(model).toMatchObject({
      id: 'model-a',
      api: 'openai-completions',
      baseUrl,
      contextWindow: 128_000,
      maxTokens: 4_096,
      reasoning: true,
    })
    expect(model.compat).toMatchObject({
      supportsReasoningEffort: true,
      maxTokensField: 'max_tokens',
      supportsStore: false,
    })
  })

  it('falls back to the default capacities when the catalog declares none', () => {
    const model = adapter.createModel(baseUrl, { id: 'model-a', name: 'Model A' })
    expect(model.contextWindow).toBe(1_000_000)
    expect(model.maxTokens).toBe(16_384)
    expect(model.compat).toMatchObject({ supportsReasoningEffort: false })
  })

  it('leaves stream options untouched', () => {
    const options = { messages: [] } as never
    expect(adapter.streamOptions(options)).toBe(options)
  })

  it('accepts a well-formed text probe and posts to /chat/completions', async () => {
    const { input, fetchImplementation } = probeInput({
      choices: [{ message: { content: 'KLC_PROVIDER_OK' } }],
    })
    await expect(adapter.probeText(input)).resolves.toBeUndefined()
    const [url, init] = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${baseUrl}/chat/completions`)
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'model-a',
      max_tokens: 32,
      stream: false,
    })
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer temporary-provider-credential',
    )
  })

  const malformedTextPayloads = [
    ['a non-object payload', 'oops'],
    ['a payload without choices', { choices: 'none' }],
    ['a non-object first choice', { choices: ['text'] }],
    ['a non-object message', { choices: [{ message: 'text' }] }],
    ['a non-string content', { choices: [{ message: { content: 7 } }] }],
    ['a blank content', { choices: [{ message: { content: '   ' } }] }],
  ] as const

  for (const [label, payload] of malformedTextPayloads) {
    it(`rejects ${label} in the text probe`, async () => {
      const { input } = probeInput(payload)
      await expect(adapter.probeText(input)).rejects.toMatchObject({
        code: 'PROVIDER_MALFORMED_RESPONSE',
      })
    })
  }

  it('accepts a single well-formed tool call carrying the nonce', async () => {
    const { input, fetchImplementation } = probeInput({
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: 'klinechartquant_connection_probe',
                  arguments: JSON.stringify({ nonce }),
                },
              },
            ],
          },
        },
      ],
    })
    await expect(adapter.probeTool(input)).resolves.toBeUndefined()
    const [, init] = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).tool_choice).toEqual({
      type: 'function',
      function: { name: 'klinechartquant_connection_probe' },
    })
  })

  const incompatibleToolPayloads = [
    ['a non-object payload', 'oops'],
    ['missing choices', { choices: {} }],
    ['a non-object first choice', { choices: ['text'] }],
    ['a message without tool_calls', { choices: [{ message: { content: 'hi' } }] }],
    ['zero tool calls', { choices: [{ message: { tool_calls: [] } }] }],
    [
      'more than one tool call',
      { choices: [{ message: { tool_calls: [{ function: {} }, { function: {} }] } }] },
    ],
    ['a non-object tool call', { choices: [{ message: { tool_calls: ['call'] } }] }],
    ['a tool call without a function', { choices: [{ message: { tool_calls: [{}] } }] }],
    [
      'a different function name',
      { choices: [{ message: { tool_calls: [{ function: { name: 'other', arguments: '{}' } }] } }] },
    ],
    [
      'non-string arguments',
      {
        choices: [
          {
            message: {
              tool_calls: [
                { function: { name: 'klinechartquant_connection_probe', arguments: { nonce } } },
              ],
            },
          },
        ],
      },
    ],
    [
      'unparsable arguments',
      {
        choices: [
          {
            message: {
              tool_calls: [
                { function: { name: 'klinechartquant_connection_probe', arguments: '{oops' } },
              ],
            },
          },
        ],
      },
    ],
    [
      'arguments that are not an object',
      {
        choices: [
          {
            message: {
              tool_calls: [
                { function: { name: 'klinechartquant_connection_probe', arguments: '[1,2]' } },
              ],
            },
          },
        ],
      },
    ],
    [
      'a mismatched nonce',
      {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    name: 'klinechartquant_connection_probe',
                    arguments: JSON.stringify({ nonce: 'replayed' }),
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  ] as const

  for (const [label, payload] of incompatibleToolPayloads) {
    it(`rejects ${label} in the tool probe`, async () => {
      const { input } = probeInput(payload)
      await expect(adapter.probeTool(input)).rejects.toMatchObject({
        code: 'PROVIDER_INCOMPATIBLE_TOOLS',
      })
    })
  }

  it('classifies stream errors by HTTP status, timeout wording, shape and transport', () => {
    expect(
      adapter.classifyStreamError(assistant(), {
        networkFailure: false,
        status: 429,
        retryAfterMs: 1_000,
      }).code,
    ).toBe('PROVIDER_RATE_LIMITED')
    expect(adapter.classifyStreamError(assistant('request timed out'), noObservation).code).toBe(
      'PROVIDER_TIMEOUT',
    )
    expect(adapter.classifyStreamError(assistant('sse stream ended'), noObservation).code).toBe(
      'PROVIDER_MALFORMED_RESPONSE',
    )
    expect(
      adapter.classifyStreamError(assistant('socket hang up'), { networkFailure: true }).code,
    ).toBe('PROVIDER_UNAVAILABLE')
    expect(adapter.classifyStreamError(assistant('unknown failure'), noObservation).code).toBe(
      'PROVIDER_ERROR',
    )
    expect(adapter.classifyStreamError(assistant(), noObservation).code).toBe('PROVIDER_ERROR')
  })

  it('ignores a sub-400 status and falls through to message classification', () => {
    expect(
      adapter.classifyStreamError(assistant('deadline exceeded'), {
        networkFailure: false,
        status: 200,
      }).code,
    ).toBe('PROVIDER_TIMEOUT')
  })
})

describe('openai-responses adapter', () => {
  const adapter = getProviderApiProtocolAdapter('openai-responses')

  it('disables cache retention in stream options', () => {
    expect(adapter.streamOptions({ messages: [] } as never)).toMatchObject({
      cacheRetention: 'none',
    })
  })

  it('builds a model without the completions-only compat flags', () => {
    const model = adapter.createModel(baseUrl, {
      id: 'model-a',
      name: 'Model A',
      reasoningEfforts: [],
    })
    expect(model.api).toBe('openai-responses')
    expect(model.compat).toEqual({
      supportsDeveloperRole: false,
      supportsLongCacheRetention: false,
      supportsStrictMode: false,
      supportsReasoningEffort: false,
    })
  })

  it('accepts the flat output_text shortcut', async () => {
    const { input, fetchImplementation } = probeInput({ output_text: 'KLC_PROVIDER_OK' })
    await expect(adapter.probeText(input)).resolves.toBeUndefined()
    const [url, init] = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${baseUrl}/responses`)
    expect(JSON.parse(init.body as string)).toMatchObject({
      max_output_tokens: 32,
      store: false,
      stream: false,
    })
  })

  it('walks the nested output array when output_text is absent', async () => {
    const { input } = probeInput({
      output: [
        'not a record',
        { content: 'not an array' },
        { content: [{ type: 'reasoning', text: 'thinking' }] },
        { content: ['not a record', { type: 'output_text', text: 'KLC_PROVIDER_OK' }] },
      ],
    })
    await expect(adapter.probeText(input)).resolves.toBeUndefined()
  })

  const malformedTextPayloads = [
    ['a non-object payload', 'oops'],
    ['a blank output_text', { output_text: '  ' }],
    ['no output array', { output: 'none' }],
    ['an output array with no text parts', { output: [{ content: [] }] }],
  ] as const

  for (const [label, payload] of malformedTextPayloads) {
    it(`rejects ${label} in the text probe`, async () => {
      const { input } = probeInput(payload)
      await expect(adapter.probeText(input)).rejects.toMatchObject({
        code: 'PROVIDER_MALFORMED_RESPONSE',
      })
    })
  }

  it('accepts exactly one function_call carrying the nonce', async () => {
    const { input, fetchImplementation } = probeInput({
      output: [
        { type: 'reasoning' },
        {
          type: 'function_call',
          name: 'klinechartquant_connection_probe',
          arguments: JSON.stringify({ nonce }),
        },
      ],
    })
    await expect(adapter.probeTool(input)).resolves.toBeUndefined()
    const [, init] = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).tool_choice).toEqual({
      type: 'function',
      name: 'klinechartquant_connection_probe',
    })
  })

  const incompatibleToolPayloads = [
    ['a non-object payload', 'oops'],
    ['no output array', { output: {} }],
    ['zero function calls', { output: [{ type: 'message' }] }],
    [
      'two function calls',
      {
        output: [
          { type: 'function_call', name: 'klinechartquant_connection_probe', arguments: '{}' },
          { type: 'function_call', name: 'klinechartquant_connection_probe', arguments: '{}' },
        ],
      },
    ],
    [
      'a mismatched nonce',
      {
        output: [
          {
            type: 'function_call',
            name: 'klinechartquant_connection_probe',
            arguments: JSON.stringify({ nonce: 'replayed' }),
          },
        ],
      },
    ],
  ] as const

  for (const [label, payload] of incompatibleToolPayloads) {
    it(`rejects ${label} in the tool probe`, async () => {
      const { input } = probeInput(payload)
      await expect(adapter.probeTool(input)).rejects.toMatchObject({
        code: 'PROVIDER_INCOMPATIBLE_TOOLS',
      })
    })
  }

  it('recognizes Responses-specific malformed stream wording', () => {
    expect(
      adapter.classifyStreamError(assistant('response.incomplete'), noObservation).code,
    ).toBe('PROVIDER_MALFORMED_RESPONSE')
    expect(
      adapter.classifyStreamError(assistant('responses stream ended'), noObservation).code,
    ).toBe('PROVIDER_MALFORMED_RESPONSE')
  })
})
