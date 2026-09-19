import { BACKGROUND_CONTEXT, MemorySessionRepo } from '@earendil-works/pi-agent-core'
import { describe, expect, it } from 'vitest'

import {
  AGENT_UI_PROTOCOL_VERSION,
  AgentRuntimeError,
  KQ_CUSTOM_ENTRY,
  RuntimeSessionService,
} from '../index'

function createFixture() {
  let now = 1_000
  let id = 0
  const repository = new MemorySessionRepo()
  const service = new RuntimeSessionService({
    repository,
    now: () => ++now,
    id: () => `id-${++id}`,
    redaction: { secretValues: ['registered-secret'] },
  })
  return { repository, service }
}

describe('RuntimeSessionService', () => {
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
    const { repository, service } = createFixture()
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
    await service.close()
    const piSession = await repository.open(
      (await repository.list(undefined, BACKGROUND_CONTEXT))[0]!,
      BACKGROUND_CONTEXT,
    )
    const originalEntry = await piSession.getEntry(first.userEntryId, BACKGROUND_CONTEXT)
    const retryEntry = await piSession.getEntry(retry.userEntryId, BACKGROUND_CONTEXT)
    expect(retryEntry?.parentId).toBe(originalEntry?.parentId)
  })

  it('checkpoints redacted replayable events and rebuilds a snapshot', async () => {
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
    expect(snapshot.messages[0]?.content).toBe('[REDACTED] at [LOCAL_PATH]/work')
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
    const { repository, service } = createFixture()
    const future = await repository.create({ id: 'future' }, BACKGROUND_CONTEXT)
    await future.setName('Future', BACKGROUND_CONTEXT)
    const futureMain = await future.createBranch('main', null, BACKGROUND_CONTEXT)
    await futureMain.appendCustomEntry(
      KQ_CUSTOM_ENTRY.sessionMetadata,
      {
        schemaVersion: 99,
        updatedAt: 1,
      },
      BACKGROUND_CONTEXT,
    )
    await future.close(BACKGROUND_CONTEXT)
    await expect(service.open('future')).rejects.toMatchObject({
      code: 'SESSION_SCHEMA_UNSUPPORTED',
    } satisfies Partial<AgentRuntimeError>)

    const corrupt = await repository.create({ id: 'corrupt' }, BACKGROUND_CONTEXT)
    await corrupt.setName('Corrupt', BACKGROUND_CONTEXT)
    const corruptMain = await corrupt.createBranch('main', null, BACKGROUND_CONTEXT)
    await corruptMain.appendCustomEntry(
      KQ_CUSTOM_ENTRY.sessionMetadata,
      {
        schemaVersion: 1,
        updatedAt: 'bad',
      },
      BACKGROUND_CONTEXT,
    )
    await corrupt.close(BACKGROUND_CONTEXT)
    await expect(service.open('corrupt')).rejects.toMatchObject({
      code: 'SESSION_CORRUPT',
    } satisfies Partial<AgentRuntimeError>)
  })

  it('migrates the supported version-zero metadata deterministically', async () => {
    const { repository, service } = createFixture()
    const legacy = await repository.create({ id: 'legacy' }, BACKGROUND_CONTEXT)
    await legacy.setName('Legacy', BACKGROUND_CONTEXT)
    const legacyMain = await legacy.createBranch('main', null, BACKGROUND_CONTEXT)
    await legacyMain.appendCustomEntry(
      KQ_CUSTOM_ENTRY.sessionMetadata,
      {
        schemaVersion: 0,
        updatedAt: 42,
      },
      BACKGROUND_CONTEXT,
    )
    await legacy.close(BACKGROUND_CONTEXT)

    expect(await service.open('legacy')).toMatchObject({
      session: { id: 'legacy', title: 'Legacy', updatedAt: 42 },
    })
    await service.close()
    const reopenedLegacy = await repository.open(
      (await repository.list(undefined, BACKGROUND_CONTEXT))[0]!,
      BACKGROUND_CONTEXT,
    )
    const metadataEntries = await reopenedLegacy.findEntries(
      {
        customType: KQ_CUSTOM_ENTRY.sessionMetadata,
        order: 'asc',
      },
      BACKGROUND_CONTEXT,
    )
    expect(
      metadataEntries.map((entry) => (entry.type === 'custom' ? entry.data : undefined)),
    ).toEqual([
      { schemaVersion: 0, updatedAt: 42 },
      { schemaVersion: 1, updatedAt: 42 },
    ])
  })
})
