// 本文件验证官方 JSONL 存储通过 IndexedDB 在关闭与重开后恢复历史。
import 'fake-indexeddb/auto'
import { createModels, fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentApplicationService } from '../application/agent-application-service'
import { type BrowserRuntimeSessions, createBrowserRuntimeSessions } from '../browser'

// Node 24 提供原生 Web Locks；较旧 Node 由浏览器手动验证此路径。
describe.skipIf(typeof navigator === 'undefined' || !navigator.locks)(
  'Browser durable sessions',
  () => {
    const opened: BrowserRuntimeSessions[] = []

    afterEach(async () => {
      for (const runtime of opened) await runtime.close()
      opened.length = 0
    })

    /** 每个用例使用独立数据库，仍通过生产装配取得真实 Web Lock。 */
    async function open(databaseName: string) {
      const runtime = await createBrowserRuntimeSessions({
        databaseName,
        redaction: { secretValues: ['browser-secret'] },
      })
      opened.push(runtime)
      return runtime
    }

    it('restores transcript, events and retry history after reopening IndexedDB', async () => {
      const name = `durable-${globalThis.crypto.randomUUID()}`
      let runtime = await open(name)
      const session = await runtime.sessions.create('Browser history')
      const first = await runtime.sessions.beginRun({
        sessionId: session.id,
        runId: 'first',
        turnId: 'first-turn',
        prompt: 'browser-secret',
        readOnly: true,
        startedAt: 1,
      })
      const faux = fauxProvider()
      faux.setResponses([fauxAssistantMessage('First response')])
      const models = createModels()
      models.setProvider(faux.provider)
      await runtime.sessions.createDriver().run({
        ...first,
        models,
        model: faux.getModel(),
        streamFn: models.streamSimple.bind(models),
        scope: { symbol: null, period: null, readOnly: true },
        tools: [],
      })
      await runtime.sessions.finishRun(first, { status: 'completed', endedAt: 3 })
      const second = await runtime.sessions.beginRun({
        sessionId: session.id,
        runId: 'second',
        turnId: 'second-turn',
        prompt: 'Follow up',
        readOnly: true,
        startedAt: 4,
      })
      await runtime.close()
      opened.pop()

      runtime = await open(name)
      expect(await runtime.sessions.list()).toEqual([
        expect.objectContaining({ id: session.id, title: 'Browser history' }),
      ])
      const restored = await runtime.sessions.findRun(second.runId)
      expect(
        (await runtime.sessions.getTranscript(restored)).filter(
          (message) => message.role !== 'system',
        ),
      ).toEqual([
        expect.objectContaining({ role: 'user', content: '[REDACTED]' }),
        expect.objectContaining({
          role: 'assistant',
          content: [{ type: 'text', text: 'First response' }],
        }),
      ])
      expect((await runtime.sessions.open(session.id)).messages.at(-1)?.content).toBe('Follow up')
      const retry = await runtime.sessions.forkRun({
        kind: 'edit',
        sessionId: session.id,
        originalRunId: second.runId,
        runId: 'retry',
        turnId: 'retry-turn',
        startedAt: 5,
        prompt: 'Edited follow up',
      })
      expect(await runtime.sessions.getTranscript(retry)).toEqual(
        await runtime.sessions.getTranscript(restored),
      )
      expect(await runtime.sessions.recoverInterrupted()).toEqual(['second', 'retry'])
      expect(await runtime.sessions.recoverInterrupted()).toEqual([])
      await runtime.sessions.rename(session.id, 'Renamed after retry')
      await runtime.close()
      opened.pop()
      runtime = await open(name)
      const app = new AgentApplicationService({
        sessions: runtime.sessions,
        createPlan: () => {
          throw new Error('This test only reads sessions.')
        },
      })
      expect(await app.initialize()).toEqual([])
      expect((await app.openSession(session.id)).session.title).toBe('Renamed after retry')
      expect(
        (await app.openSession(session.id)).messages.map((message) => message.content),
      ).toEqual(['[REDACTED]', 'First response', 'Edited follow up'])
      expect((await runtime.sessions.findRun(second.runId)).prompt).toBe('Follow up')
      const next = await runtime.sessions.beginRun({
        sessionId: session.id,
        runId: 'after-reload',
        turnId: 'after-reload-turn',
        prompt: 'Continue on the retry branch',
        readOnly: true,
        startedAt: 6,
      })
      expect(next.lane).toBe(retry.lane)
      await runtime.sessions.delete(session.id)
      await runtime.close()
      opened.pop()
      runtime = await open(name)
      expect(await runtime.sessions.list()).toEqual([])
    })

    it('initializes an existing session without runs after reopening IndexedDB', async () => {
      const name = `durable-empty-${globalThis.crypto.randomUUID()}`
      let runtime = await open(name)
      const session = await runtime.sessions.create('Existing session')
      await runtime.close()
      opened.pop()
      runtime = await open(name)
      const app = new AgentApplicationService({
        sessions: runtime.sessions,
        createPlan: () => {
          throw new Error('This test only reads sessions.')
        },
      })
      expect(await app.initialize()).toEqual([])
      expect((await app.openSession(session.id)).session).toEqual(session)
      const run = await runtime.sessions.beginRun({
        sessionId: session.id,
        runId: 'first-after-reload',
        turnId: 'first-after-reload-turn',
        prompt: 'First question',
        readOnly: true,
        startedAt: 1,
      })
      expect(run.lane).toBe('main')
    })

    it('rejects a second writer and releases the lock on close', async () => {
      const name = `durable-lock-${globalThis.crypto.randomUUID()}`
      const first = await open(name)
      await expect(createBrowserRuntimeSessions({ databaseName: name })).rejects.toThrow(
        'another page',
      )
      await first.close()
      opened.pop()
      const second = await open(name)
      expect(await second.sessions.list()).toEqual([])
    })

    it('reads beyond one page of official messages without duplicating inherited history', async () => {
      const runtime = await open(`durable-pages-${globalThis.crypto.randomUUID()}`)
      const session = await runtime.sessions.create()
      const faux = fauxProvider()
      faux.setResponses(
        Array.from({ length: 105 }, (_, index) => fauxAssistantMessage(`Answer ${index}`)),
      )
      const models = createModels()
      models.setProvider(faux.provider)
      for (let index = 0; index < 105; index++) {
        const run = await runtime.sessions.beginRun({
          sessionId: session.id,
          runId: `run-${index}`,
          turnId: `turn-${index}`,
          prompt: `Question ${index}`,
          readOnly: true,
          startedAt: index,
        })
        await runtime.sessions.createDriver().run({
          ...run,
          models,
          model: faux.getModel(),
          streamFn: models.streamSimple.bind(models),
          scope: { symbol: null, period: null, readOnly: true },
          tools: [],
        })
        await runtime.sessions.finishRun(run, { status: 'completed', endedAt: index + 1 })
      }
      const snapshot = await runtime.sessions.open(session.id)
      expect(snapshot.messages).toHaveLength(210)
      expect(snapshot.messages.at(-1)?.content).toBe('Answer 104')
      expect(new Set(snapshot.messages.map((message) => message.id)).size).toBe(210)
    })
  },
)
