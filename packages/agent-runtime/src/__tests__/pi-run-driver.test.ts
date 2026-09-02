import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxThinking,
  fauxToolCall,
} from '@earendil-works/pi-ai'
import { Type } from 'typebox'
import { describe, expect, it, vi } from 'vitest'

import {
  AgentRuntimeError,
  PiRunDriver,
  type AgentRunUiEventInput,
  type PiRunPlan,
  type RuntimeToolDefinition,
} from '../index'

function fixture(
  responses: Parameters<ReturnType<typeof fauxProvider>['setResponses']>[0],
  tools: RuntimeToolDefinition[] = [],
  tokensPerSecond = 10_000,
) {
  const faux = fauxProvider({ tokensPerSecond, tokenSize: { min: 1, max: 1 } })
  faux.setResponses(responses)
  const models = createModels()
  models.setProvider(faux.provider)
  const plan: PiRunPlan = {
    sessionId: 'session-1',
    runId: 'run-1',
    turnId: 'turn-1',
    prompt: 'Inspect the chart',
    readOnly: true,
    scope: { symbol: 'BTCUSDT', period: '1h', readOnly: true },
    tools,
    model: faux.getModel(),
    streamFn: models.streamSimple.bind(models),
  }
  return { faux, plan }
}

describe('PiRunDriver', () => {
  it('projects ordered thinking and text deltas with usage', async () => {
    const { plan } = fixture([
      fauxAssistantMessage([
        fauxThinking('private chain'),
        { type: 'text', text: 'Visible answer' },
      ]),
    ])
    const events: AgentRunUiEventInput[] = []
    const result = await new PiRunDriver({ id: () => 'assistant-1' }).run(plan, (event) => {
      events.push(event)
    })

    expect(result.text).toBe('Visible answer')
    expect(
      events
        .filter((event) => event.type === 'assistant.text.delta')
        .map((event) => ('delta' in event ? event.delta : ''))
        .join(''),
    ).toBe('Visible answer')
    expect(
      events
        .filter((event) => event.type === 'assistant.thinking.delta')
        .map((event) => ('delta' in event ? event.delta : ''))
        .join(''),
    ).toBe('private chain')
    expect(result.usage).toMatchObject({
      inputTokens: expect.any(Number),
      outputTokens: expect.any(Number),
    })
  })

  it('projects tool progress/result with run-scoped public IDs and propagates AbortSignal', async () => {
    const signals: AbortSignal[] = []
    const execute = vi.fn<RuntimeToolDefinition['execute']>(
      async (_input: unknown, context: Parameters<RuntimeToolDefinition['execute']>[1]) => {
        signals.push(context.signal)
        context.progress({ label: 'Reading bars', current: 1, total: 2 })
        return { content: '20 rows', summary: '20 RSI values returned.' }
      },
    )
    const tool: RuntimeToolDefinition = {
      name: 'indicator.query',
      label: 'Query indicator',
      description: 'Query one indicator',
      parameters: Type.Object({ symbol: Type.String() }),
      safety: 'read-only',
      reversible: false,
      summarizeInput: () => 'RSI(14)',
      execute,
    }
    const { plan } = fixture(
      [
        fauxAssistantMessage(
          fauxToolCall('indicator.query', { symbol: 'BTCUSDT' }, { id: 'provider-call-1' }),
          { stopReason: 'toolUse' },
        ),
        fauxAssistantMessage('The indicator is neutral.'),
      ],
      [tool],
    )
    const events: AgentRunUiEventInput[] = []
    const result = await new PiRunDriver().run(plan, (event) => {
      events.push(event)
    })

    expect(execute).toHaveBeenCalledOnce()
    expect(signals[0]).toBeInstanceOf(AbortSignal)
    expect(result.completedToolCount).toBe(1)
    expect(events.find((event) => event.type === 'tool.started')).toMatchObject({
      call: { id: 'run-1:provider-call-1', status: 'running' },
    })
    expect(events.find((event) => event.type === 'tool.progress')).toMatchObject({
      progress: { label: 'Reading bars', current: 1, total: 2 },
    })
    expect(events.find((event) => event.type === 'tool.finished')).toMatchObject({
      result: {
        status: 'succeeded',
        resultSummary: '20 RSI values returned.',
        resultContent: '20 rows',
      },
    })
  })

  it('returns a recoverable tool failure to the model while marking the UI call as failed', async () => {
    const tool: RuntimeToolDefinition = {
      name: 'drawing.create',
      label: 'Create drawing',
      description: 'Create one drawing',
      parameters: Type.Object({}),
      safety: 'destructive',
      reversible: false,
      execute: async () => ({
        content: '{"success":false,"stateChanged":false}',
        summary: 'Unknown drawing pane.',
        failure: {
          code: 'UNKNOWN_PANE_ID',
          message: 'Unknown drawing pane.',
          retryable: true,
          recommendedAction: 'Use paneId: main.',
        },
      }),
    }
    const { plan } = fixture(
      [
        fauxAssistantMessage(fauxToolCall('drawing.create', {}, { id: 'drawing-1' }), {
          stopReason: 'toolUse',
        }),
        fauxAssistantMessage('I will retry with the main pane.'),
      ],
      [tool],
    )
    plan.readOnly = false
    plan.scope = { ...plan.scope, readOnly: false }
    const events: AgentRunUiEventInput[] = []

    const result = await new PiRunDriver().run(plan, (event) => {
      events.push(event)
    })

    expect(result.completedToolCount).toBe(0)
    expect(events.find((event) => event.type === 'tool.finished')).toMatchObject({
      result: {
        status: 'failed',
        error: {
          code: 'UNKNOWN_PANE_ID',
          recommendedAction: 'Use paneId: main.',
        },
      },
    })
  })

  it('converts a thrown tool error into feedback the model can use', async () => {
    const tool: RuntimeToolDefinition = {
      name: 'market_bars_query',
      label: 'Query market bars',
      description: 'Query market bars',
      parameters: Type.Object({}),
      safety: 'read-only',
      reversible: false,
      execute: async () => {
        throw new Error('Unknown sourceId. Available sourceIds: gotdx, baostock.')
      },
    }
    const { plan } = fixture(
      [
        fauxAssistantMessage(fauxToolCall('market_bars_query', {}, { id: 'bars-1' }), {
          stopReason: 'toolUse',
        }),
        fauxAssistantMessage('I will retry with an available source.'),
      ],
      [tool],
    )
    const events: AgentRunUiEventInput[] = []

    await expect(new PiRunDriver().run(plan, (event) => events.push(event))).resolves.toMatchObject({
      text: 'I will retry with an available source.',
      completedToolCount: 0,
    })
    expect(events.find((event) => event.type === 'tool.finished')).toMatchObject({
      result: {
        status: 'failed',
        error: {
          code: 'TOOL_ERROR',
          message: 'Unknown sourceId. Available sourceIds: gotdx, baostock.',
        },
      },
    })
  })

  it('maps provider failure to a stable error without leaking its secret', async () => {
    const { plan } = fixture([
      fauxAssistantMessage('', {
        stopReason: 'error',
        errorMessage: 'Bearer abc.def.ghi rejected',
      }),
    ])
    await expect(new PiRunDriver().run(plan, () => undefined)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      message: 'The Provider request failed.',
    } satisfies Partial<AgentRuntimeError>)
  })

  it('aborts an active Pi stream', async () => {
    const { plan } = fixture([fauxAssistantMessage('x'.repeat(2_000))])
    const driver = new PiRunDriver()
    let cancelled = false
    const running = driver.run(plan, (event) => {
      if (!cancelled && event.type === 'assistant.text.delta') {
        cancelled = true
        driver.abort()
      }
    })
    await expect(running).rejects.toMatchObject({
      code: 'ABORTED',
    } satisfies Partial<AgentRuntimeError>)
  })

  it('enforces the configured tool-turn limit', async () => {
    const tool: RuntimeToolDefinition = {
      name: 'loop',
      label: 'Loop',
      description: 'Loop',
      parameters: Type.Object({}),
      safety: 'read-only',
      reversible: false,
      execute: async () => ({ content: 'continue', summary: 'continued' }),
    }
    const { plan } = fixture(
      [
        fauxAssistantMessage(fauxToolCall('loop', {}, { id: 'one' }), { stopReason: 'toolUse' }),
        fauxAssistantMessage(fauxToolCall('loop', {}, { id: 'two' }), { stopReason: 'toolUse' }),
      ],
      [tool],
    )
    plan.toolTurnLimit = 1
    await expect(new PiRunDriver().run(plan, () => undefined)).rejects.toMatchObject({
      code: 'TOOL_LOOP_LIMIT',
    } satisfies Partial<AgentRuntimeError>)
  })

  it('does not execute a non-read-only tool supplied to a read-only plan', async () => {
    const execute = vi.fn(async () => ({ content: 'cleared', summary: 'Chart cleared.' }))
    const tool: RuntimeToolDefinition = {
      name: 'chart.clear',
      label: 'Clear chart',
      description: 'Clear chart drawings',
      parameters: Type.Object({}),
      safety: 'destructive',
      reversible: false,
      execute,
    }
    const { plan } = fixture(
      [
        fauxAssistantMessage(fauxToolCall('chart.clear', {}, { id: 'clear-1' }), {
          stopReason: 'toolUse',
        }),
        fauxAssistantMessage('The requested chart change is not allowed.'),
      ],
      [tool],
    )

    const events: AgentRunUiEventInput[] = []
    await new PiRunDriver().run(plan, (event) => {
      events.push(event)
    })
    expect(execute).not.toHaveBeenCalled()
    expect(events.find((event) => event.type === 'tool.finished')).toMatchObject({
      result: { status: 'failed' },
    })
  })

  it('maps a Provider deadline to a distinct stable error', async () => {
    const { plan } = fixture([fauxAssistantMessage('x')], [], 1)
    plan.timeoutMs = 1
    await expect(new PiRunDriver().run(plan, () => undefined)).rejects.toMatchObject({
      code: 'DEADLINE_EXCEEDED',
    } satisfies Partial<AgentRuntimeError>)
  })

  it('refreshes the deadline while the Provider streams output', async () => {
    const { plan } = fixture([fauxAssistantMessage('x'.repeat(5))], [], 100)
    plan.timeoutMs = 15

    await expect(new PiRunDriver().run(plan, () => undefined)).resolves.toMatchObject({
      text: 'xxxxx',
    })
  })

  it('propagates a Provider deadline to an active tool AbortSignal', async () => {
    let toolSignalAborted = false
    const tool: RuntimeToolDefinition = {
      name: 'wait',
      label: 'Wait',
      description: 'Wait until aborted',
      parameters: Type.Object({}),
      safety: 'read-only',
      reversible: false,
      execute: async (_input, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              toolSignalAborted = true
              reject(new Error('tool aborted'))
            },
            { once: true },
          )
        }),
    }
    const { plan } = fixture(
      [fauxAssistantMessage(fauxToolCall('wait', {}, { id: 'wait-1' }), { stopReason: 'toolUse' })],
      [tool],
    )
    plan.timeoutMs = 20

    await expect(new PiRunDriver().run(plan, () => undefined)).rejects.toMatchObject({
      code: 'DEADLINE_EXCEEDED',
    } satisfies Partial<AgentRuntimeError>)
    expect(toolSignalAborted).toBe(true)
  })
})
