// 本文件验证官方 JSONL 存储通过 IndexedDB 在关闭与重开后恢复历史。
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { type BrowserRuntimeSessions, createBrowserRuntimeSessions } from '../browser'
import { AGENT_UI_PROTOCOL_VERSION } from '../contracts/ui'

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
      await runtime.sessions.appendAssistantMessage(first, 'First response', 2)
      await runtime.sessions.finishRun(first, { status: 'completed', endedAt: 3 })
      const second = await runtime.sessions.beginRun({
        sessionId: session.id,
        runId: 'second',
        turnId: 'second-turn',
        prompt: 'Follow up',
        readOnly: true,
        startedAt: 4,
      })
      await runtime.sessions.persistEvent({
        sessionId: session.id,
        lane: second.lane,
        event: {
          protocolVersion: AGENT_UI_PROTOCOL_VERSION,
          sequence: 7,
          type: 'run.started',
          runId: second.runId,
          sessionId: session.id,
          startedAt: 4,
        },
      })
      await runtime.close()
      opened.pop()

      runtime = await open(name)
      expect(await runtime.sessions.list()).toEqual([
        expect.objectContaining({ id: session.id, title: 'Browser history' }),
      ])
      const restored = await runtime.sessions.findRun(second.runId)
      expect(await runtime.sessions.getTranscript(restored)).toEqual([
        expect.objectContaining({ role: 'user', content: '[REDACTED]' }),
        expect.objectContaining({
          role: 'assistant',
          content: [{ type: 'text', text: 'First response' }],
        }),
      ])
      expect((await runtime.sessions.open(session.id)).lastSequence).toBe(7)
      const retry = await runtime.sessions.retryRun({
        sessionId: session.id,
        originalRunId: second.runId,
        runId: 'retry',
        turnId: 'retry-turn',
        startedAt: 5,
      })
      expect(await runtime.sessions.getTranscript(retry)).toEqual(
        await runtime.sessions.getTranscript(restored),
      )
      expect(await runtime.sessions.recoverInterrupted()).toEqual(['second', 'retry'])
      expect(await runtime.sessions.recoverInterrupted()).toEqual([])
      await runtime.sessions.delete(session.id)
      await runtime.close()
      opened.pop()
      runtime = await open(name)
      expect(await runtime.sessions.list()).toEqual([])
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

    it('reads beyond one page of entries without duplicating inherited events', async () => {
      const runtime = await open(`durable-pages-${globalThis.crypto.randomUUID()}`)
      const session = await runtime.sessions.create()
      const run = await runtime.sessions.beginRun({
        sessionId: session.id,
        runId: 'long-run',
        turnId: 'long-turn',
        prompt: 'History',
        readOnly: true,
        startedAt: 1,
      })
      for (let index = 0; index < 105; index++) {
        await runtime.sessions.persistEvent({
          sessionId: session.id,
          lane: run.lane,
          event: {
            protocolVersion: AGENT_UI_PROTOCOL_VERSION,
            sequence: index + 1,
            type: 'user.message.created',
            runId: run.runId,
            sessionId: session.id,
            message: {
              id: `message-${index}`,
              role: 'user',
              content: `${index}`,
              createdAt: index,
            },
          },
        })
      }
      const snapshot = await runtime.sessions.open(session.id)
      expect(snapshot.messages).toHaveLength(105)
      expect(snapshot.lastSequence).toBe(105)
    })
  },
)
