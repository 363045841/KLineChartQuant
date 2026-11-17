// 应用服务测试：目录与视图事件、窗口分页与更早条目的按需加载。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestRuntime, entryItems, type TestRuntime } from './_runtime-fixture.js'

let runtime: TestRuntime

beforeEach(async () => {
  runtime = await createTestRuntime()
})

afterEach(async () => {
  await runtime.close()
})

describe('AgentApplicationService', () => {
  it('publishes catalog and close events for session lifecycle changes', async () => {
    const events: string[] = []
    const unsubscribe = runtime.app.subscribe((event) => events.push(event.type))

    const session = await runtime.app.createSession()
    await runtime.app.openSession(session.id)
    await runtime.app.deleteSession(session.id)
    unsubscribe()

    expect(events).toContain('sessions.changed')
    expect(events).toContain('session.closed')
    expect(await runtime.app.listSessions()).toEqual([])
  })

  it('keeps the newest window and loads earlier entries on request', async () => {
    const session = await runtime.sessions.create('History')
    const handle = await runtime.sessions.watch(session.id, () => undefined)
    for (let index = 0; index < 60; index += 1) {
      await runtime.execution.harness.commit(
        (tx) =>
          tx.appendEntry(handle.conversation.id, {
            kind: 'pi.user',
            model: [{ role: 'user', content: `message ${index}`, timestamp: index }],
          }),
        BACKGROUND_CONTEXT,
      )
    }
    await handle.stop()

    const opened = await runtime.app.openSession(session.id)
    expect(entryItems(opened).length).toBeLessThan(60)
    expect(opened.items[0]?.kind).toBe('earlier')

    const loaded = await runtime.app.loadEarlier(session.id)
    expect(entryItems(loaded).length).toBe(60)
    expect(loaded.items.some((item) => item.kind === 'earlier')).toBe(false)
  })
})
