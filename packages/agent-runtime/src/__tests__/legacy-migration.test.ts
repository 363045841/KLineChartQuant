// 旧版会话回填：主分支会话补上标题文档，分支、已删除与无元数据的会话跳过。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { MemoryStorage } from '@earendil-works/pi-durable'
import { afterEach, describe, expect, it } from 'vitest'
import type { DurableExecution } from '../pi/impl/run.js'
import { openDurableExecution } from '../sessions/durable-execution.js'
import { LegacySessionIdentityDoc } from '../sessions/legacy-session.js'
import { AgentSessionService } from '../sessions/session-service.js'

let execution: DurableExecution

afterEach(async () => {
  await execution.harness.close(BACKGROUND_CONTEXT)
})

interface LegacyOptions {
  title: string
  lane?: string
  deleted?: boolean
  updatedAt?: number
  metadata?: boolean
}

/** 按已发布版本的结构写入一个旧会话。 */
async function createLegacyConversation(options: LegacyOptions): Promise<string> {
  const conversation = await execution.harness.createConversation(
    {
      ownership: { kind: 'ownerless' },
      init: async (tx, conversationId) => {
        const identity = await tx.doc(LegacySessionIdentityDoc, conversationId)
        identity.sessionId = `session-${conversationId}`
        identity.lane = options.lane ?? 'main'
        identity.title = options.title
        identity.deleted = options.deleted ?? false
      },
    },
    BACKGROUND_CONTEXT,
  )
  await execution.harness.commit(async (tx) => {
    await tx.appendEntry(conversation.id, { kind: 'kq.message' })
    if (options.metadata !== false) {
      await tx.appendEntry(conversation.id, {
        kind: 'kq.session.metadata',
        data: { schemaVersion: 1, updatedAt: options.updatedAt ?? 100 },
      })
    }
  }, BACKGROUND_CONTEXT)
  return String(conversation.id)
}

describe('legacy session adoption', () => {
  it('backfills the title document of published main sessions', async () => {
    execution = await openDurableExecution(new MemoryStorage())
    const legacyId = await createLegacyConversation({ title: 'Legacy title', updatedAt: 555 })
    const service = new AgentSessionService({ execution })

    expect(await service.list()).toEqual([])
    await service.adoptLegacySessions()
    expect(await service.list()).toEqual([{ id: legacyId, title: 'Legacy title', updatedAt: 555 }])

    const watch = await service.watch(legacyId, () => undefined)
    expect(watch.title).toBe('Legacy title')
    await watch.stop()
  })

  it('is idempotent and skips deleted, forked, and metadata-less sessions', async () => {
    execution = await openDurableExecution(new MemoryStorage())
    const mainId = await createLegacyConversation({ title: 'Main', updatedAt: 200 })
    await createLegacyConversation({ title: 'Deleted', deleted: true })
    await createLegacyConversation({ title: 'Fork', lane: 'fork:run-1' })
    await createLegacyConversation({ title: 'No metadata', metadata: false })
    const service = new AgentSessionService({ execution })

    await service.adoptLegacySessions()
    await service.adoptLegacySessions()
    expect(await service.list()).toEqual([{ id: mainId, title: 'Main', updatedAt: 200 }])
  })
})
