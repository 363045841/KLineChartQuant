// 通过真实 RuntimeSessionService 持久化事件，再 open() 重放，覆盖快照折叠的各条分支。
import { InMemorySessionRepo } from '@earendil-works/pi-agent-core'
import { describe, expect, it } from 'vitest'

import { RuntimeSessionService, type AgentSessionSnapshot } from '../index'

function createFixture() {
  let now = 1_000
  let id = 0
  return new RuntimeSessionService({
    repository: new InMemorySessionRepo(),
    now: () => ++now,
    id: () => `id-${++id}`,
  })
}

function toolCall(id: string, status: string) {
  return {
    id,
    name: 'set_indicator',
    status,
    safety: 'destructive',
    reversible: true,
    inputSummary: 'RSI 14',
    startedAt: 2_000,
  }
}

async function snapshotOf(
  service: RuntimeSessionService,
  sessionId: string,
): Promise<AgentSessionSnapshot> {
  return service.open(sessionId)
}

describe('RuntimeSessionService snapshot replay', () => {
  it('folds a full assistant turn: streaming deltas, completion and citations', async () => {
    const service = createFixture()
    const session = await service.create()
    const lane = 'main'
    await service.persistEvent({
      sessionId: session.id,
      lane,
      event: {
        type: 'assistant.message.started',
        sessionId: session.id,
        messageId: 'msg-1',
        createdAt: 2_000,
      } as never,
    })
    for (const delta of ['Hel', 'lo ', 'world']) {
      await service.persistEvent({
        sessionId: session.id,
        lane,
        event: {
          type: 'assistant.text.delta',
          sessionId: session.id,
          messageId: 'msg-1',
          delta,
        } as never,
      })
    }
    // 未知 messageId 的 delta 必须被丢弃，而不是凭空造出一条消息。
    await service.persistEvent({
      sessionId: session.id,
      lane,
      event: {
        type: 'assistant.text.delta',
        sessionId: session.id,
        messageId: 'msg-unknown',
        delta: 'orphan',
      } as never,
    })
    await service.persistEvent({
      sessionId: session.id,
      lane,
      event: {
        type: 'assistant.message.completed',
        sessionId: session.id,
        messageId: 'msg-1',
        citations: [{ id: 'web:call-1:1', title: 'Doc', url: 'https://example.com' }],
      } as never,
    })

    const snapshot = await snapshotOf(service, session.id)
    expect(snapshot.messages).toHaveLength(1)
    expect(snapshot.messages[0]).toMatchObject({
      id: 'msg-1',
      role: 'assistant',
      content: 'Hello world',
      status: 'complete',
      citations: [{ id: 'web:call-1:1', title: 'Doc', url: 'https://example.com' }],
    })
  })

  it('marks a failed assistant message and attaches no citations', async () => {
    const service = createFixture()
    const session = await service.create()
    await service.persistEvent({
      sessionId: session.id,
      lane: 'main',
      event: {
        type: 'assistant.message.started',
        sessionId: session.id,
        messageId: 'msg-1',
        createdAt: 2_000,
      } as never,
    })
    await service.persistEvent({
      sessionId: session.id,
      lane: 'main',
      event: {
        type: 'assistant.message.failed',
        sessionId: session.id,
        messageId: 'msg-1',
      } as never,
    })
    const snapshot = await snapshotOf(service, session.id)
    expect(snapshot.messages[0]).toMatchObject({ status: 'failed' })
    expect(snapshot.messages[0]).not.toHaveProperty('citations')
  })

  it('ignores completion events for messages that were never started', async () => {
    const service = createFixture()
    const session = await service.create()
    await service.persistEvent({
      sessionId: session.id,
      lane: 'main',
      event: {
        type: 'assistant.message.completed',
        sessionId: session.id,
        messageId: 'ghost',
      } as never,
    })
    expect((await snapshotOf(service, session.id)).messages).toEqual([])
  })

  it('folds the tool-call lifecycle including progress, finish and undo', async () => {
    const service = createFixture()
    const session = await service.create()
    const lane = 'main'
    const persist = (event: unknown) =>
      service.persistEvent({ sessionId: session.id, lane, event: event as never })

    await persist({ type: 'tool.started', sessionId: session.id, call: toolCall('call-1', 'running') })
    await persist({
      type: 'tool.progress',
      sessionId: session.id,
      toolCallId: 'call-1',
      progress: { label: 'Applying', current: 1, total: 2 },
    })
    // 未知 toolCallId 的进度与撤销都不得凭空创建卡片。
    await persist({
      type: 'tool.progress',
      sessionId: session.id,
      toolCallId: 'ghost',
      progress: { label: 'Applying', current: 1, total: 2 },
    })
    await persist({ type: 'tool.undone', sessionId: session.id, toolCallId: 'ghost' })

    let snapshot = await snapshotOf(service, session.id)
    expect(snapshot.toolCalls).toHaveLength(1)
    expect(snapshot.toolCalls[0]).toMatchObject({
      id: 'call-1',
      status: 'running',
      progress: { label: 'Applying', current: 1, total: 2 },
    })

    await persist({
      type: 'tool.finished',
      sessionId: session.id,
      result: { ...toolCall('call-1', 'succeeded'), resultSummary: 'RSI applied', finishedAt: 2_100 },
    })
    snapshot = await snapshotOf(service, session.id)
    expect(snapshot.toolCalls[0]).toMatchObject({
      status: 'succeeded',
      resultSummary: 'RSI applied',
    })
    expect(snapshot.toolCalls[0]).not.toHaveProperty('progress')

    await persist({ type: 'tool.undone', sessionId: session.id, toolCallId: 'call-1' })
    expect((await snapshotOf(service, session.id)).toolCalls[0]).toMatchObject({ status: 'undone' })
  })

  it('replays every run terminal status onto the same run record', async () => {
    const terminals: ReadonlyArray<readonly [Record<string, unknown>, string]> = [
      [{ type: 'run.completed', endedAt: 3_000, usage: { inputTokens: 10 } }, 'completed'],
      [{ type: 'run.failed', endedAt: 3_000, error: { code: 'PROVIDER_ERROR' } }, 'failed'],
      [{ type: 'run.interrupted', endedAt: 3_000, error: { code: 'RUN_INTERRUPTED' } }, 'interrupted'],
      [{ type: 'run.cancelled', endedAt: 3_000, partial: false }, 'cancelled'],
      [{ type: 'run.cancelled', endedAt: 3_000, partial: true }, 'partial'],
    ]

    for (const [terminal, status] of terminals) {
      const service = createFixture()
      const session = await service.create()
      const persist = (event: unknown) =>
        service.persistEvent({ sessionId: session.id, lane: 'main', event: event as never })

      await persist({
        type: 'run.started',
        sessionId: session.id,
        runId: 'run-1',
        startedAt: 2_000,
      })
      await persist({ type: 'run.cancelling', sessionId: session.id, runId: 'run-1' })
      await persist({ ...terminal, sessionId: session.id, runId: 'run-1' })

      const snapshot = await snapshotOf(service, session.id)
      expect(snapshot.runs).toHaveLength(1)
      expect(snapshot.runs[0]).toMatchObject({
        id: 'run-1',
        sessionId: session.id,
        status,
        startedAt: 2_000,
        endedAt: 3_000,
      })
    }
  })

  it('leaves a run idle when only a cancelling event was seen for an unknown run', async () => {
    const service = createFixture()
    const session = await service.create()
    await service.persistEvent({
      sessionId: session.id,
      lane: 'main',
      event: { type: 'run.cancelling', sessionId: session.id, runId: 'run-ghost' } as never,
    })
    expect((await snapshotOf(service, session.id)).runs[0]).toMatchObject({
      id: 'run-ghost',
      status: 'cancelling',
    })
  })
})
