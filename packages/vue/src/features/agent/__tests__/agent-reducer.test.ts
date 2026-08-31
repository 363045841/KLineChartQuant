/** Replay coverage for the stable Agent UI event contract. */
import { describe, expect, it } from 'vitest'

import { AGENT_UI_PROTOCOL_VERSION, type AgentUiEvent, type ToolCallView } from '../agent-contracts'
import { createInitialAgentState, reduceAgentUiEvent } from '../agent-reducer'

const RUN_ID = 'run-1'
const SESSION_ID = 'session-1'

type EventWithoutProtocol = AgentUiEvent extends infer T
  ? T extends { protocolVersion: number }
    ? Omit<T, 'protocolVersion'>
    : never
  : never

function event(input: EventWithoutProtocol): AgentUiEvent {
  return { protocolVersion: AGENT_UI_PROTOCOL_VERSION, ...input } as AgentUiEvent
}

function replay(events: AgentUiEvent[]) {
  return events.reduce(reduceAgentUiEvent, createInitialAgentState())
}

function tool(overrides: Partial<ToolCallView> = {}): ToolCallView {
  return {
    id: 'tool-1',
    runId: RUN_ID,
    name: 'indicators_query',
    label: 'Query RSI',
    status: 'running',
    inputSummary: 'RSI(14), latest 20 bars',
    safety: 'read-only',
    reversible: false,
    startedAt: 100,
    ...overrides,
  }
}

describe('reduceAgentUiEvent', () => {
  it('replays ordered streaming deltas into one assistant message', () => {
    const state = replay([
      event({ type: 'run.started', runId: RUN_ID, sessionId: SESSION_ID, startedAt: 10 }),
      event({
        type: 'user.message.created',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        message: { id: 'user-1', role: 'user', content: 'Analyze RSI', createdAt: 11 },
      }),
      event({
        type: 'assistant.message.started',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        messageId: 'assistant-1',
        createdAt: 12,
      }),
      event({
        type: 'assistant.text.delta',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        messageId: 'assistant-1',
        delta: 'RSI ',
      }),
      event({
        type: 'assistant.text.delta',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        messageId: 'assistant-1',
        delta: 'is neutral.',
      }),
      event({
        type: 'assistant.message.completed',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        messageId: 'assistant-1',
      }),
    ])

    expect(state.messages).toHaveLength(2)
    expect(state.messages[1]).toMatchObject({
      id: 'assistant-1',
      content: 'RSI is neutral.',
      status: 'complete',
    })
    expect(state.run.status).toBe('running')
  })

  it('replays streamed reasoning into a separate completed message', () => {
    const state = replay([
      event({ type: 'run.started', runId: RUN_ID, sessionId: SESSION_ID, startedAt: 10 }),
      event({
        type: 'assistant.thinking.started',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        messageId: 'thinking-1',
        createdAt: 11,
      }),
      event({
        type: 'assistant.thinking.delta',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        messageId: 'thinking-1',
        delta: 'Inspecting the current trend.',
      }),
      event({
        type: 'assistant.thinking.completed',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        messageId: 'thinking-1',
      }),
    ])

    expect(state.messages).toEqual([
      {
        id: 'thinking-1',
        role: 'reasoning',
        content: 'Inspecting the current trend.',
        createdAt: 11,
        status: 'complete',
      },
    ])
  })

  it('projects structured confirmation and rejection without executing the tool', () => {
    const state = replay([
      event({ type: 'run.started', runId: RUN_ID, sessionId: SESSION_ID, startedAt: 10 }),
      event({ type: 'tool.started', runId: RUN_ID, sessionId: SESSION_ID, call: tool() }),
      event({
        type: 'tool.confirmation.required',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        request: {
          id: 'confirm-1',
          toolCallId: 'tool-1',
          title: 'Clear all drawings?',
          description: 'Removes 4 drawings from this chart.',
          impact: '4 drawing objects',
          reversible: true,
          expiresAt: 500,
          status: 'pending',
        },
      }),
      event({
        type: 'tool.confirmation.resolved',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        confirmationId: 'confirm-1',
        decision: 'rejected',
      }),
    ])

    expect(state.confirmations[0]?.status).toBe('rejected')
    expect(state.toolCalls[0]?.status).toBe('rejected')
  })

  it('keeps completed mutations visible when cancellation is partial', () => {
    const state = replay([
      event({ type: 'run.started', runId: RUN_ID, sessionId: SESSION_ID, startedAt: 10 }),
      event({
        type: 'tool.started',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        call: tool({ safety: 'reversible-write', reversible: true }),
      }),
      event({
        type: 'tool.finished',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        result: tool({
          status: 'succeeded',
          safety: 'reversible-write',
          reversible: true,
          resultSummary: 'RSI added to a new pane.',
          resultContent: 'RSI(14) added to a new pane.',
          undoToken: 'undo-1',
          finishedAt: 120,
        }),
      }),
      event({ type: 'run.cancelling', runId: RUN_ID, sessionId: SESSION_ID }),
      event({
        type: 'run.cancelled',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        partial: true,
        endedAt: 130,
      }),
    ])

    expect(state.run.status).toBe('partial')
    expect(state.toolCalls[0]).toMatchObject({
      status: 'succeeded',
      resultContent: 'RSI(14) added to a new pane.',
      undoToken: 'undo-1',
    })
    expect(state.canUndoTurn).toBe(true)
  })

  it('starts retries as a new run while preserving the prior timeline', () => {
    const state = replay([
      event({ type: 'run.started', runId: RUN_ID, sessionId: SESSION_ID, startedAt: 10 }),
      event({
        type: 'run.failed',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        endedAt: 20,
        error: {
          code: 'PROVIDER_ERROR',
          message: 'Provider unavailable',
          retryable: true,
          recommendedAction: 'Retry the run.',
        },
      }),
      event({ type: 'run.started', runId: 'run-2', sessionId: SESSION_ID, startedAt: 30 }),
    ])

    expect(state.run).toMatchObject({ id: 'run-2', status: 'running' })
    expect(state.previousRuns).toHaveLength(1)
    expect(state.previousRuns[0]).toMatchObject({ id: RUN_ID, status: 'failed' })
  })

  it('marks a reversible tool as undone', () => {
    const state = replay([
      event({ type: 'run.started', runId: RUN_ID, sessionId: SESSION_ID, startedAt: 10 }),
      event({ type: 'tool.started', runId: RUN_ID, sessionId: SESSION_ID, call: tool() }),
      event({
        type: 'tool.undone',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        toolCallId: 'tool-1',
        undoneAt: 40,
      }),
    ])

    expect(state.toolCalls[0]).toMatchObject({ status: 'undone', finishedAt: 40 })
  })

  it('ignores late events from an inactive run', () => {
    const state = replay([
      event({ type: 'run.started', runId: RUN_ID, sessionId: SESSION_ID, startedAt: 10 }),
      event({ type: 'run.started', runId: 'run-2', sessionId: SESSION_ID, startedAt: 20 }),
      event({
        type: 'assistant.message.started',
        runId: RUN_ID,
        sessionId: SESSION_ID,
        messageId: 'stale-message',
        createdAt: 30,
      }),
    ])

    expect(state.run.id).toBe('run-2')
    expect(state.messages).toHaveLength(0)
  })

  it('deduplicates replayed events at or before the applied sequence cursor', () => {
    const started = event({
      type: 'run.started',
      runId: RUN_ID,
      sessionId: SESSION_ID,
      startedAt: 10,
      sequence: 11,
    })
    const message = event({
      type: 'user.message.created',
      runId: RUN_ID,
      sessionId: SESSION_ID,
      sequence: 12,
      message: { id: 'user-1', role: 'user', content: 'Analyze RSI', createdAt: 11 },
    })
    const state = replay([started, message, structuredClone(message)])

    expect(state.messages).toHaveLength(1)
    expect(state.lastSequence).toBe(12)
    expect(reduceAgentUiEvent(state, started)).toBe(state)
  })
})
