// 会话服务测试：标题文档、官方条目顺序、分支重跑与取消入口。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentRuntimeError } from '../index.js'
import { entryItems, entryText, createTestRuntime, type TestRuntime, waitForSession } from './_runtime-fixture.js'

let runtime: TestRuntime

beforeEach(async () => {
  runtime = await createTestRuntime()
  await runtime.app.testProvider({
    baseUrl: 'https://provider.example.test/v1',
    model: 'faux-fast',
    protocol: 'openai-responses',
  })
})

afterEach(async () => {
  await runtime.close()
})

/** 创建一个会话并跑完一轮，返回会话标识与完整读取结果。 */
async function runOnce(prompt = 'summarize the current trend') {
  const session = await runtime.app.createSession()
  await runtime.app.startRun({ sessionId: session.id, prompt, readOnly: true })
  const view = await waitForSession(runtime.app, session.id, (candidate) =>
    entryItems(candidate).some(
      (entry) => entry.kind === 'pi.assistant' && entryText(entry).length > 0,
    ),
  )
  return { session, view }
}

describe('AgentSessionService', () => {
  it('keeps title and activity time in the official session document', async () => {
    const created = await runtime.sessions.create('Alpha')
    expect(created.title).toBe('Alpha')
    expect((await runtime.sessions.list()).map((item) => item.id)).toEqual([created.id])

    await runtime.sessions.rename(created.id, 'Beta')
    const renamed = (await runtime.sessions.list())[0]
    expect(renamed?.title).toBe('Beta')
    expect(renamed?.updatedAt).toBeGreaterThanOrEqual(created.updatedAt)

    await runtime.sessions.delete(created.id)
    expect(await runtime.sessions.list()).toEqual([])
  })

  it('stores the user prompt as the official first entry and keeps model order', async () => {
    const { view } = await runOnce('summarize the current trend')
    const entries = entryItems(view)
    const kinds = entries.map((entry) => entry.kind)

    expect(kinds[0]).toBe('pi.user')
    expect(kinds).toContain('pi.tool-result')
    expect(kinds.slice(-1)).toEqual(['pi.assistant'])
    expect(entries[0] && entryText(entries[0])).toBe('summarize the current trend')

    const callIndex = kinds.indexOf('pi.assistant')
    const callMessage = entries[callIndex]?.model?.[0]
    expect(callMessage?.role).toBe('assistant')
    expect(callMessage?.role === 'assistant' ? callMessage.content[0]?.type : undefined).toBe(
      'toolCall',
    )

    const resultIndex = kinds.indexOf('pi.tool-result')
    expect(resultIndex).toBeGreaterThan(callIndex)
    expect(entries[resultIndex]?.model?.[0]?.role).toBe('toolResult')
    const finalEntry = entries.at(-1)
    expect(finalEntry ? entryText(finalEntry).length : 0).toBeGreaterThan(0)
  })

  it('forks before the edited input and retires the source session', async () => {
    const { session, view } = await runOnce('retry this request')
    const userEntry = entryItems(view)[0]
    expect(userEntry).toBeDefined()

    const started = await runtime.app.retryRun({
      sessionId: session.id,
      entryId: userEntry!.id,
      readOnly: true,
    })
    expect(started.sessionId).not.toBe(session.id)

    const sessions = await runtime.app.listSessions()
    expect(sessions.map((item) => item.id)).toEqual([started.sessionId])
    expect(sessions[0]?.title).toBe(session.title)

    await waitForSession(
      runtime.app,
      started.sessionId,
      (candidate) =>
        entryItems(candidate).some(
          (entry) => entry.kind === 'pi.assistant' && entryText(entry).length > 0,
        ),
    )
    await expect(
      runtime.sessions.watch(session.id, () => undefined),
    ).rejects.toBeInstanceOf(AgentRuntimeError)
  })

  it('replaces the prompt when an edit is submitted', async () => {
    const { session, view } = await runOnce('original request')
    const userEntry = entryItems(view)[0]

    const started = await runtime.app.editMessage({
      sessionId: session.id,
      entryId: userEntry!.id,
      prompt: 'edited request',
      readOnly: true,
    })
    const edited = await waitForSession(runtime.app, started.sessionId, (candidate) =>
      entryItems(candidate).some(
        (entry) => entry.kind === 'pi.user' && entryText(entry) === 'edited request',
      ),
    )
    const firstEntry = entryItems(edited)[0]
    expect(firstEntry ? entryText(firstEntry) : '').toBe('edited request')
  })

  it('pages the official entry history newest first', async () => {
    const { session } = await runOnce('page this session')
    const page = await runtime.sessions.entries(session.id, { order: 'descending' }, 2)
    expect(page.items).toHaveLength(2)
    expect(page.items[0]!.id).toBeGreaterThan(page.items[1]!.id)
    expect(page.next).toBeDefined()
  })

  it('rejects unknown sessions instead of fabricating an empty conversation', async () => {
    await expect(runtime.sessions.watch('999999', () => undefined)).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    })
  })
})
