// 本文件验证重新生成的历史回放保留原消息位置与唯一用户提问。
import { describe, expect, it } from 'vitest'
import { AGENT_UI_PROTOCOL_VERSION, type AgentUiEvent } from '../contracts/ui'
import { replaySnapshot } from '../sessions/session-replay'

describe('regenerated reply replay', () => {
  it('replaces the original reply in place across repeated regeneration', () => {
    const envelope = { protocolVersion: AGENT_UI_PROTOCOL_VERSION, sessionId: 'session' }
    const events: AgentUiEvent[] = [
      { ...envelope, type: 'run.started', runId: 'original', startedAt: 1 },
      {
        ...envelope,
        type: 'user.message.created',
        runId: 'original',
        message: { id: 'user', role: 'user', content: 'Question', createdAt: 1 },
      },
      {
        ...envelope,
        type: 'assistant.message.started',
        runId: 'original',
        messageId: 'old-reply',
        createdAt: 2,
      },
      {
        ...envelope,
        type: 'assistant.text.delta',
        runId: 'original',
        messageId: 'old-reply',
        delta: 'Old answer',
      },
      {
        ...envelope,
        type: 'assistant.message.completed',
        runId: 'original',
        messageId: 'old-reply',
      },
      {
        ...envelope,
        type: 'user.message.created',
        runId: 'later',
        message: { id: 'later-user', role: 'user', content: 'Later question', createdAt: 3 },
      },
    ]
    let source = 'original'
    for (const runId of ['retry', 'retry-again']) {
      events.push(
        { ...envelope, type: 'run.started', runId, startedAt: 4, retryOfRunId: source },
        { ...envelope, type: 'assistant.message.started', runId, messageId: runId, createdAt: 5 },
        { ...envelope, type: 'assistant.text.delta', runId, messageId: runId, delta: 'New answer' },
        { ...envelope, type: 'assistant.message.completed', runId, messageId: runId },
      )
      source = runId
    }
    const snapshot = replaySnapshot({ id: 'session', title: 'Session', updatedAt: 5 }, events)
    expect(snapshot.messages.map((message) => message.id)).toEqual([
      'user',
      'retry-again',
      'later-user',
    ])
    expect(snapshot.messages[1]).toMatchObject({
      createdAt: 2,
      content: 'New answer',
      runId: 'retry-again',
      status: 'complete',
    })
  })
})
