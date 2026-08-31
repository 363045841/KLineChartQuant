import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeAgentBridge } from '../testing/fake-agent-bridge'

import type { AgentUiEvent } from '../agent-contracts'

describe('FakeAgentBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T00:00:00Z'))
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                { id: 'provider-model-a', name: 'Provider Model A' },
                { id: 'provider-model-b', name: 'Provider Model B' },
              ],
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      ),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('persists a tested Provider only after confirmation without retaining the credential in view data', async () => {
    const bridge = new FakeAgentBridge({ stepDelayMs: 10 })
    const events: AgentUiEvent[] = []
    bridge.subscribe((event) => events.push(event))

    const input = {
      baseUrl: 'https://models.example.test/v1',
      apiKey: 'test-secret',
      model: 'provider-model-a',
      protocol: 'openai-completions' as const,
    }
    const pending = bridge.testProvider(input)
    expect(events).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(10)
    await expect(pending).resolves.toMatchObject({ compatible: true, model: 'provider-model-a' })
    expect(events).toHaveLength(0)

    await bridge.saveProvider({ ...input, modelName: 'Provider Model A', profileName: 'Provider A' })
    expect(events.at(-1)).toMatchObject({
      type: 'provider.status.changed',
      status: { state: 'connected', modelLabel: 'Provider Model A' },
    })
    expect(JSON.stringify(events)).not.toContain('test-secret')
  })

  it('returns bounded non-secret model views', async () => {
    const bridge = new FakeAgentBridge()
    const result = await bridge.listProviderModels({
      baseUrl: 'https://models.example.test/v1',
      apiKey: 'test-secret',
      protocol: 'openai-responses',
    })
    expect(result.models.map((model) => model.id)).toEqual(['provider-model-a', 'provider-model-b'])
    expect(JSON.stringify(result)).not.toContain('test-secret')
  })

  it('streams a successful read scenario through the normalized event contract', async () => {
    const bridge = new FakeAgentBridge({ stepDelayMs: 10, providerConfigured: true })
    const events: AgentUiEvent[] = []
    bridge.subscribe((event) => events.push(event))

    const { runId } = await bridge.startRun({
      sessionId: 'session-1',
      prompt: 'Analyze RSI over the latest bars',
      readOnly: false,
    })
    await vi.advanceTimersByTimeAsync(500)

    expect(events[0]).toMatchObject({ type: 'run.started', runId })
    expect(events.some((event) => event.type === 'assistant.text.delta')).toBe(true)
    expect(events.find((event) => event.type === 'tool.finished')).toMatchObject({
      result: { status: 'succeeded', safety: 'read-only' },
    })
    expect(events.at(-1)).toMatchObject({ type: 'run.completed', runId })
  })

  it('supports accepted and rejected structured confirmations', async () => {
    const bridge = new FakeAgentBridge({ stepDelayMs: 10, providerConfigured: true })
    const events: AgentUiEvent[] = []
    bridge.subscribe((event) => events.push(event))

    await bridge.startRun({
      sessionId: 'session-1',
      prompt: 'Clear all drawings',
      readOnly: false,
    })
    await vi.advanceTimersByTimeAsync(40)
    const required = events.find(
      (event): event is Extract<AgentUiEvent, { type: 'tool.confirmation.required' }> =>
        event.type === 'tool.confirmation.required',
    )
    expect(required).toBeDefined()

    await bridge.confirmTool(required!.request.id, 'confirmed')
    await vi.advanceTimersByTimeAsync(500)
    expect(events.some((event) => event.type === 'tool.finished')).toBe(true)
    expect(events.some((event) => event.type === 'run.completed')).toBe(true)

    const second = new FakeAgentBridge({ stepDelayMs: 10, providerConfigured: true })
    const secondEvents: AgentUiEvent[] = []
    second.subscribe((event) => secondEvents.push(event))
    await second.startRun({
      sessionId: 'session-1',
      prompt: 'Delete all drawings',
      readOnly: false,
    })
    await vi.advanceTimersByTimeAsync(40)
    const secondRequired = secondEvents.find(
      (event): event is Extract<AgentUiEvent, { type: 'tool.confirmation.required' }> =>
        event.type === 'tool.confirmation.required',
    )
    await second.confirmTool(secondRequired!.request.id, 'rejected')
    await vi.advanceTimersByTimeAsync(500)
    expect(secondEvents).toContainEqual(
      expect.objectContaining({ type: 'tool.confirmation.resolved', decision: 'rejected' }),
    )
    expect(secondEvents.some((event) => event.type === 'tool.finished')).toBe(false)
  })

  it('reports a partial stop after a completed mutation and exposes undo', async () => {
    const bridge = new FakeAgentBridge({ stepDelayMs: 10, providerConfigured: true })
    const events: AgentUiEvent[] = []
    bridge.subscribe((event) => events.push(event))

    const { runId } = await bridge.startRun({
      sessionId: 'session-1',
      prompt: 'Add EMA 20',
      readOnly: false,
    })
    await vi.advanceTimersByTimeAsync(40)
    await bridge.cancelRun(runId)

    expect(events.at(-1)).toMatchObject({ type: 'run.cancelled', partial: true })
    await bridge.undoTurn(runId)
    expect(events.at(-1)).toMatchObject({ type: 'tool.undone', runId })
  })

  it('emits recoverable failure and starts retry as a distinct run', async () => {
    const bridge = new FakeAgentBridge({ stepDelayMs: 10, providerConfigured: true })
    const events: AgentUiEvent[] = []
    bridge.subscribe((event) => events.push(event))

    const first = await bridge.startRun({
      sessionId: 'session-1',
      prompt: 'Trigger provider error',
      readOnly: false,
    })
    await vi.advanceTimersByTimeAsync(50)
    expect(events.at(-1)).toMatchObject({
      type: 'run.failed',
      error: { retryable: true },
    })

    const retry = await bridge.retryRun(first.runId)
    expect(retry.runId).not.toBe(first.runId)
    expect(events.at(-1)).toMatchObject({ type: 'user.message.created', runId: retry.runId })
  })
})
