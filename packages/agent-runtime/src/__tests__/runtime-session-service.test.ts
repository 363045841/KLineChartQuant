import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { createSession, MemoryStorage } from '@earendil-works/pi-durable'
import { describe, expect, it } from 'vitest'

import {
  AGENT_UI_PROTOCOL_VERSION,
  AgentRuntimeError,
  KQ_CUSTOM_ENTRY,
  RuntimeSessionService,
} from '../index'
import {
  SESSION_LANE,
  SESSION_SCAN_PAGE_SIZE,
  SessionIdentityDoc,
  scanAll,
} from '../sessions/durable-session'

function createFixture() {
  let now = 1_000
  let id = 0
  const session = createSession(new MemoryStorage())
  const service = new RuntimeSessionService({
    session,
    now: () => ++now,
    id: () => `id-${++id}`,
    redaction: { secretValues: ['registered-secret'] },
  })
  return { session, service }
}

describe('RuntimeSessionService', () => {
  it('preserves usage metadata through persistence and replay', async () => {
    const { service } = createFixture()
    const session = await service.create()
    const run = await service.beginRun({
      sessionId: session.id,
      runId: 'usage-run',
      turnId: 'usage-turn',
      prompt: 'registered-secret',
      readOnly: true,
      startedAt: 1,
    })
    const usage = {
      inputTokens: 1200,
      outputTokens: 300,
      contextTokens: 1100,
      contextWindow: 128000,
      costUsd: 0.01,
      durationMs: 50,
    }
    await service.appendAssistantMessage(run, 'registered-secret', 2)
    const event = await service.finishRun(run, { status: 'completed', endedAt: 2 }, { usage })
    expect(event).toMatchObject({ type: 'run.completed', usage })
    expect((await service.open(session.id)).runs[0]?.usage).toEqual(usage)
    const followUp = await service.beginRun({
      sessionId: session.id,
      runId: 'follow-up',
      turnId: 'next',
      prompt: 'Next',
      readOnly: true,
      startedAt: 3,
    })
    expect(await service.getTranscript(followUp)).toContainEqual(
      expect.objectContaining({
        role: 'assistant',
        content: [{ type: 'text', text: 'registered-secret' }],
      }),
    )
  })
  it('creates, lists, opens, renames, and deletes Pi sessions', async () => {
    const { service } = createFixture()
    const created = await service.create()
    expect((await service.list())[0]).toEqual(created)
    expect((await service.open(created.id)).messages).toEqual([])

    await service.rename(created.id, 'Momentum branch')
    expect((await service.list())[0]?.title).toBe('Momentum branch')
    await service.delete(created.id)
    expect(await service.list()).toEqual([])
    await expect(service.open(created.id)).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' })
  })

  it('persists follow-ups and creates retry at the original user parent', async () => {
    const { service } = createFixture()
    const session = await service.create()
    const first = await service.beginRun({
      sessionId: session.id,
      runId: 'run-1',
      turnId: 'turn-1',
      prompt: 'Inspect RSI',
      readOnly: true,
      startedAt: 1_100,
    })
    await service.finishRun(first, { status: 'completed', endedAt: 1_200 })
    const followUp = await service.beginRun({
      sessionId: session.id,
      runId: 'run-2',
      turnId: 'turn-2',
      prompt: 'Compare MACD',
      readOnly: true,
      startedAt: 1_300,
    })
    const transcript = await service.getTranscript(followUp)
    const retry = await service.retryRun({
      sessionId: session.id,
      originalRunId: first.runId,
      runId: 'run-3',
      turnId: 'turn-3',
      startedAt: 1_400,
    })

    expect(followUp.lane).toBe('main')
    expect(transcript).toEqual([expect.objectContaining({ role: 'user', content: 'Inspect RSI' })])
    expect(retry).toMatchObject({
      prompt: 'Inspect RSI',
      retryOfRunId: 'run-1',
      lane: 'retry:run-3',
    })
    expect(retry.userEntryId).not.toBe(first.userEntryId)
    expect(await service.getTranscript(retry)).toEqual([])
    expect(await service.getTranscript(followUp)).toEqual(transcript)
  })

  it('redacts the prompt and preserves replayable event content', async () => {
    const { service } = createFixture()
    const session = await service.create()
    const run = await service.beginRun({
      sessionId: session.id,
      runId: 'run-1',
      turnId: 'turn-1',
      prompt: 'registered-secret',
      readOnly: true,
      startedAt: 1_100,
    })
    await service.persistEvent({
      sessionId: session.id,
      lane: run.lane,
      event: {
        type: 'run.started',
        runId: run.runId,
        sessionId: session.id,
        startedAt: 1_100,
        sequence: 1,
        protocolVersion: AGENT_UI_PROTOCOL_VERSION,
      },
    })
    await service.persistEvent({
      sessionId: session.id,
      lane: run.lane,
      event: {
        type: 'user.message.created',
        runId: run.runId,
        sessionId: session.id,
        sequence: 2,
        protocolVersion: AGENT_UI_PROTOCOL_VERSION,
        message: {
          id: 'message-1',
          role: 'user',
          content: 'registered-secret at /Users/alice/work',
          createdAt: 1_101,
        },
      },
    })

    const snapshot = await service.open(session.id)
    expect(snapshot.lastSequence).toBe(2)
    expect(snapshot.runs[0]?.status).toBe('running')
    expect(run.prompt).toBe('[REDACTED]')
    expect(snapshot.messages[0]?.content).toBe('registered-secret at /Users/alice/work')
  })

  it('marks durable non-terminal runs interrupted exactly once', async () => {
    const { service } = createFixture()
    const session = await service.create()
    await service.beginRun({
      sessionId: session.id,
      runId: 'run-open',
      turnId: 'turn-1',
      prompt: 'Inspect',
      readOnly: true,
      startedAt: 1_100,
    })

    expect(await service.recoverInterrupted()).toEqual(['run-open'])
    expect(await service.recoverInterrupted()).toEqual([])
    expect((await service.open(session.id)).runs[0]?.status).toBe('interrupted')
  })

  it('fails closed on future and corrupt schemas', async () => {
    const { session, service } = createFixture()
    await seedMetadata(session, 'future', 99, 1)
    await expect(service.open('future')).rejects.toMatchObject({
      code: 'SESSION_SCHEMA_UNSUPPORTED',
    } satisfies Partial<AgentRuntimeError>)

    await seedMetadata(session, 'corrupt', 1, 'bad')
    await expect(service.open('corrupt')).rejects.toMatchObject({
      code: 'SESSION_CORRUPT',
    } satisfies Partial<AgentRuntimeError>)
  })

  it('rejects version-zero metadata without migrating stored history', async () => {
    const { session, service } = createFixture()
    const conversationId = await seedMetadata(session, 'legacy', 0, 42)

    await expect(service.open('legacy')).rejects.toMatchObject({
      code: 'SESSION_SCHEMA_UNSUPPORTED',
    })
    const metadataEntries = await session.commit(
      (tx) =>
        scanAll((cursor) => tx.scanEntries({ conversationId }, SESSION_SCAN_PAGE_SIZE, cursor)),
      BACKGROUND_CONTEXT,
    )
    expect(metadataEntries.reverse().map((entry) => entry.data)).toEqual([
      { schemaVersion: 0, updatedAt: 42 },
    ])
  })
})

/** 用真实 pi-durable 事务写入不同版本的业务元数据。 */
async function seedMetadata(
  session: ReturnType<typeof createSession>,
  id: string,
  schemaVersion: number,
  updatedAt: number | string,
) {
  return session.commit(async (tx) => {
    const conversation = await tx.createConversation({ ownership: { kind: 'ownerless' } })
    Object.assign(await tx.doc(SessionIdentityDoc, conversation.id), {
      sessionId: id,
      lane: SESSION_LANE.main,
      title: id,
    })
    await tx.appendEntry(conversation.id, {
      kind: KQ_CUSTOM_ENTRY.sessionMetadata,
      data: { schemaVersion, updatedAt },
    })
    return conversation.id
  }, BACKGROUND_CONTEXT)
}
