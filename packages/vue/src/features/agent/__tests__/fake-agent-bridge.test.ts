import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentUiEvent } from '../agent-contracts'
import { FakeAgentBridge } from '../testing/fake-agent-bridge'
import { stubProviderModelCatalog } from './_agentProviderFixtures'

/** 断言测试 Bridge 交付完整快照。 */
function snapshot(events: AgentUiEvent[]) {
  const event = [...events].reverse().find((item) => item.type === 'session.snapshot')
  if (event?.type !== 'session.snapshot') throw new Error('No conversation snapshot received.')
  return event.snapshot
}

describe('FakeAgentBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-24T00:00:00Z'))
    stubProviderModelCatalog()
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

    await bridge.saveProvider({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      protocol: input.protocol,
      profileName: 'Provider A',
    })
    expect(events.at(-1)).toMatchObject({
      type: 'provider.status.changed',
      status: { state: 'not-configured' },
    })
    expect(JSON.stringify(events)).not.toContain('test-secret')
  })

  it('returns bounded non-secret model views', async () => {
    const bridge = new FakeAgentBridge()
    await bridge.saveProvider({
      baseUrl: 'https://models.example.test/v1',
      apiKey: 'test-secret',
      protocol: 'openai-responses',
      profileName: 'Provider A',
    })
    const result = await bridge.listProviderModelCatalog()
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

    expect(events[0]).toMatchObject({ type: 'session.snapshot' })
    expect(
      snapshot(events).messages.some((message) => message.role === 'assistant' && message.content),
    ).toBe(true)
    expect(snapshot(events).toolCalls).toContainEqual(
      expect.objectContaining({ status: 'succeeded', safety: 'read-only' }),
    )
    expect(snapshot(events).runs.at(-1)).toMatchObject({ status: 'completed', id: runId })
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
    const required = snapshot(events).confirmations?.at(-1)
    expect(required).toBeDefined()

    await bridge.confirmTool(required!.id, 'confirmed')
    await vi.advanceTimersByTimeAsync(500)
    expect(snapshot(events).toolCalls.some((tool) => tool.status === 'succeeded')).toBe(true)
    expect(snapshot(events).runs.at(-1)?.status).toBe('completed')

    const second = new FakeAgentBridge({ stepDelayMs: 10, providerConfigured: true })
    const secondEvents: AgentUiEvent[] = []
    second.subscribe((event) => secondEvents.push(event))
    await second.startRun({
      sessionId: 'session-1',
      prompt: 'Delete all drawings',
      readOnly: false,
    })
    await vi.advanceTimersByTimeAsync(40)
    const secondRequired = snapshot(secondEvents).confirmations?.at(-1)
    await second.confirmTool(secondRequired!.id, 'rejected')
    await vi.advanceTimersByTimeAsync(500)
    expect(snapshot(secondEvents).confirmations?.at(-1)?.status).toBe('rejected')
    expect(snapshot(secondEvents).toolCalls.some((tool) => tool.status === 'succeeded')).toBe(false)
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

    expect(snapshot(events).runs.at(-1)?.status).toBe('partial')
    await bridge.undoTurn(runId)
    expect(
      snapshot(events).toolCalls.some((tool) => tool.status === 'undone' && tool.runId === runId),
    ).toBe(true)
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
    expect(snapshot(events).runs.at(-1)).toMatchObject({
      status: 'failed',
      error: { retryable: true },
    })

    const retry = await bridge.retryRun(first.runId)
    expect(retry.runId).not.toBe(first.runId)
    expect(snapshot(events).runs.at(-1)).toMatchObject({ id: retry.runId, status: 'running' })
  })
})
