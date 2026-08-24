import { describe, expect, it } from 'vitest'

import {
  AGENT_IPC_PAYLOAD_VERSION,
  AGENT_IPC_PROTOCOL_VERSION,
  AgentRuntimeError,
  createUnavailableRuntimeSupport,
  parseAgentIpcRequest,
  redactValue,
  type AgentRuntimeErrorCode,
} from '../index'

function request(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: AGENT_IPC_PROTOCOL_VERSION,
    payloadVersion: AGENT_IPC_PAYLOAD_VERSION,
    windowId: 'window-1',
    chartId: 'chart-1',
    requestId: 'request-1',
    deadlineAt: 2_000,
    command: 'run.start',
    payload: { sessionId: 'session-1', prompt: 'Inspect RSI', readOnly: true },
    ...overrides,
  }
}

describe('Agent IPC contracts', () => {
  it('accepts a strict versioned command envelope', () => {
    expect(parseAgentIpcRequest(request(), 1_000).command).toBe('run.start')
  })

  const malformedEnvelopeCases: Array<[Record<string, unknown>, AgentRuntimeErrorCode]> = [
    [request({ forged: true }), 'INVALID_PAYLOAD'],
    [request({ protocolVersion: 99 }), 'INVALID_PROTOCOL'],
    [request({ deadlineAt: 999 }), 'DEADLINE_EXCEEDED'],
    [
      request({ payload: { sessionId: 'session-1', prompt: 'x', readOnly: true, rawIpc: {} } }),
      'INVALID_PAYLOAD',
    ],
  ]

  it.each(malformedEnvelopeCases)('rejects malformed envelopes with stable errors', (input, code) => {
    expect(() => parseAgentIpcRequest(input, 1_000)).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeError>>({ code }),
    )
  })

  it('rejects oversized values before dispatch', () => {
    const input = request({
      payload: { sessionId: 'session-1', prompt: 'x'.repeat(300_000), readOnly: true },
    })
    expect(() => parseAgentIpcRequest(input, 1_000)).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeError>>({ code: 'PAYLOAD_TOO_LARGE' }),
    )
  })

  it('maps non-JSON values to a stable invalid-payload error', () => {
    const cyclic: Record<string, unknown> = request()
    cyclic.payload = { cyclic }
    expect(() => parseAgentIpcRequest(cyclic, 1_000)).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeError>>({ code: 'INVALID_PAYLOAD' }),
    )
  })

  it('accepts a bounded model refresh command without requiring a replacement key', () => {
    const parsed = parseAgentIpcRequest(
      request({
        command: 'provider.models',
        payload: { baseUrl: 'https://api.302.ai/v1' },
      }),
      1_000,
    )
    expect(parsed).toMatchObject({
      command: 'provider.models',
      payload: { baseUrl: 'https://api.302.ai/v1' },
    })
  })
})

describe('redaction', () => {
  it('removes secret-shaped fields, registered values, auth headers, and local usernames', () => {
    const secret = 'temporary-provider-value'
    const result = redactValue(
      {
        apiKey: secret,
        nested: {
          authorization: 'Bearer abc.def.ghi',
          message: `failure at /Users/alice/project with ${secret} and sk-abcdefghijklmnop`,
          hiddenThinking: 'private reasoning',
        },
      },
      { secretValues: [secret] },
    )
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('abc.def.ghi')
    expect(serialized).not.toContain('alice')
    expect(serialized).not.toContain('private reasoning')
    expect(serialized).not.toContain('sk-abcdefghijklmnop')
  })
})

describe('production Provider fallback', () => {
  it('fails closed instead of returning faux Provider results', async () => {
    const support = createUnavailableRuntimeSupport()

    expect(await support.provider.getStatus()).toEqual({
      state: 'not-configured',
      providerLabel: '302.ai',
      configured: false,
      baseUrl: 'https://api.302.ai/v1',
      compatibility: 'unknown',
    })
    await expect(
      support.provider.test({
        baseUrl: 'https://api.302.ai/v1',
        apiKey: 'ephemeral',
        model: 'fast-model',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' })
    await expect(
      support.provider.listModels({
        baseUrl: 'https://api.302.ai/v1',
        apiKey: 'ephemeral',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' })
    expect(() => support.createPlan(undefined as never)).toThrowError(
      expect.objectContaining<Partial<AgentRuntimeError>>({ code: 'PROVIDER_NOT_CONFIGURED' }),
    )
    await expect(support.provider.deleteCredential()).resolves.toBeUndefined()
  })
})
