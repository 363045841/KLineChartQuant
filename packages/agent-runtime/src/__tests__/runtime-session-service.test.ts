// 使用真实 Harness 验证目录、分支、输入脱敏和 schema，不模拟模型事件。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { createModels, fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai'
import { MemoryStorage } from '@earendil-works/pi-durable'
import { afterEach, describe, expect, it } from 'vitest'
import { openDurableExecution } from '../sessions/durable-execution'
import { SESSION_LANE, SessionIdentityDoc } from '../sessions/durable-session'
import { RuntimeSessionService } from '../sessions/runtime-session-service'
import { KQ_CUSTOM_ENTRY } from '../sessions/types'

const opened: Awaited<ReturnType<typeof openDurableExecution>>[] = []
afterEach(async () => {
  for (const execution of opened.splice(0)) await execution.harness.close(BACKGROUND_CONTEXT)
})

/** 创建与生产相同的官方运行时。 */
async function fixture() {
  const execution = await openDurableExecution(new MemoryStorage())
  opened.push(execution)
  const service = new RuntimeSessionService({
    session: execution.harness,
    execution,
    redaction: { secretValues: ['registered-secret'] },
  })
  return { service, execution }
}

describe('RuntimeSessionService', () => {
  it('creates, lists, opens, renames and deletes official conversations', async () => {
    const { service } = await fixture()
    const session = await service.create('Analysis')
    expect(await service.list()).toEqual([session])
    expect((await service.open(session.id)).messages).toEqual([])
    await service.rename(session.id, 'Renamed')
    expect((await service.open(session.id)).session.title).toBe('Renamed')
    await service.delete(session.id)
    expect(await service.list()).toEqual([])
    await expect(service.open(session.id)).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' })
  })

  it('desensitizes only user input and projects official outputs and usage', async () => {
    const { service } = await fixture()
    const session = await service.create()
    const run = await service.beginRun({
      sessionId: session.id,
      runId: 'first',
      turnId: 'turn',
      prompt: 'registered-secret',
      readOnly: true,
      startedAt: 1,
    })
    const faux = fauxProvider()
    faux.setResponses([fauxAssistantMessage('registered-secret\n\n完整答案')])
    const models = createModels()
    models.setProvider(faux.provider)
    await service.createDriver().run({
      ...run,
      models,
      model: faux.getModel(),
      streamFn: models.streamSimple.bind(models),
      scope: { symbol: null, period: null, readOnly: true },
      tools: [],
    })
    // 模拟回答已提交、宿主目录时间尚未写入时停止；恢复不能将官方成功答案标记中断。
    expect(await service.recoverInterrupted()).toEqual([])
    const snapshot = await service.open(session.id)
    expect(snapshot.messages.map((message) => message.content)).toEqual([
      '[REDACTED]',
      'registered-secret\n\n完整答案',
    ])
    expect(snapshot.runs[0]?.status).toBe('completed')
    expect(typeof snapshot.runs[0]?.usage?.outputTokens).toBe('number')
  })

  it('marks submissions interrupted once and preserves the frozen input for retry', async () => {
    const { service } = await fixture()
    const session = await service.create()
    await service.beginRun({
      sessionId: session.id,
      runId: 'pending',
      turnId: 'turn',
      prompt: 'Question',
      readOnly: true,
      startedAt: 1,
    })
    expect(await service.recoverInterrupted()).toEqual(['pending'])
    expect(await service.recoverInterrupted()).toEqual([])
    expect((await service.open(session.id)).runs[0]?.status).toBe('interrupted')
    const retry = await service.retryRun({
      sessionId: session.id,
      originalRunId: 'pending',
      runId: 'retry',
      turnId: 'retry-turn',
      startedAt: 2,
    })
    expect(retry.prompt).toBe('Question')
    expect(await service.getTranscript(retry)).toEqual([])
    const followUp = await service.beginRun({
      sessionId: session.id,
      runId: 'next',
      turnId: 'next-turn',
      prompt: 'Continue',
      readOnly: true,
      startedAt: 3,
    })
    expect(followUp.lane).toBe(retry.lane)
  })

  it.each([
    [99, 1, 'SESSION_SCHEMA_UNSUPPORTED'],
    [0, 1, 'SESSION_SCHEMA_UNSUPPORTED'],
    [1, 'bad', 'SESSION_CORRUPT'],
  ] as const)('rejects schema %s with timestamp %s', async (schemaVersion, updatedAt, code) => {
    const { service, execution } = await fixture()
    await execution.harness.commit(async (tx) => {
      const conversation = await tx.createConversation({ ownership: { kind: 'ownerless' } })
      Object.assign(await tx.doc(SessionIdentityDoc, conversation.id), {
        sessionId: 'invalid',
        lane: SESSION_LANE.main,
        title: 'Invalid',
      })
      await tx.appendEntry(conversation.id, {
        kind: KQ_CUSTOM_ENTRY.sessionMetadata,
        data: { schemaVersion, updatedAt },
      })
    }, BACKGROUND_CONTEXT)
    await expect(service.open('invalid')).rejects.toMatchObject({ code })
  })
})
