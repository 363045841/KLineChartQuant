// 会话服务测试：标题文档、官方条目顺序、分支重跑、继续运行与取消入口。
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { LiveDoc } from '@earendil-works/pi-durable'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type AgentTranscriptView, KQ_USER_ENTRY_KIND } from '../contracts/ui.js'
import { PLAN_MODE_READ_ONLY } from '../host/impl/mode-gate.js'
import { AgentRuntimeError } from '../index.js'
import {
  createTestRuntime,
  entryItems,
  entryText,
  type TestRuntime,
  waitForSession,
} from './_runtime-fixture.js'

let runtime: TestRuntime

beforeEach(async () => {
  runtime = await createTestRuntime({ configured: true })
})

afterEach(async () => {
  await runtime.close()
})

/** 创建一个会话并跑完一轮，返回会话标识与完整读取结果。 */
async function runOnce(prompt = 'summarize the current trend') {
  const session = await runtime.app.createSession()
  await runtime.app.startRun({ sessionId: session.id, prompt, mode: 'plan' })
  const view = await waitForSession(runtime.app, session.id, (candidate) =>
    entryItems(candidate).some(
      (entry) => entry.kind === 'pi.assistant' && entryText(entry).length > 0,
    ),
  )
  return { session, view }
}

/** 读取官方 `pi.live.runFailure.reason`，用于断言运行失败原因。 */
function runFailureReason(view: AgentTranscriptView): string | undefined {
  const live = view.docs[LiveDoc.definition.kind]
  if (typeof live !== 'object' || live === null || Array.isArray(live)) return undefined
  const failure = live.runFailure
  if (typeof failure !== 'object' || failure === null || Array.isArray(failure)) return undefined
  return typeof failure.reason === 'string' ? failure.reason : undefined
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

    expect(kinds[0]).toBe(KQ_USER_ENTRY_KIND)
    expect(kinds).toContain('pi.tool-result')
    expect(kinds.slice(-1)).toEqual(['pi.assistant'])
    expect(entries[0] && entryText(entries[0])).toContain('summarize the current trend')

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

  it('rejects write tool calls in plan mode without hiding the tool', async () => {
    const session = await runtime.app.createSession()
    await runtime.app.startRun({
      sessionId: session.id,
      prompt: 'delete the selected drawing',
      mode: 'plan',
    })
    const view = await waitForSession(runtime.app, session.id, (candidate) =>
      entryItems(candidate).some((entry) => entry.kind === 'pi.tool-result'),
    )
    const result = entryItems(view).find((entry) => entry.kind === 'pi.tool-result')
    expect(result ? JSON.stringify(result.model) : '').toContain(PLAN_MODE_READ_ONLY)
  })

  it('reads the visible prompt instead of the injected context', async () => {
    const { view } = await runOnce('keep the raw prompt')
    const userEntry = entryItems(view)[0]
    expect(userEntry).toBeDefined()
    await expect(runtime.sessions.readUserPrompt(userEntry!.id)).resolves.toBe(
      'keep the raw prompt',
    )
  })

  it('forks before the edited input and retires the source session', async () => {
    const { session, view } = await runOnce('retry this request')
    const userEntry = entryItems(view)[0]
    expect(userEntry).toBeDefined()

    const started = await runtime.app.retryRun({
      sessionId: session.id,
      entryId: userEntry!.id,
      mode: 'plan',
    })
    expect(started.sessionId).not.toBe(session.id)

    const sessions = await runtime.app.listSessions()
    expect(sessions.map((item) => item.id)).toEqual([started.sessionId])
    expect(sessions[0]?.title).toBe(session.title)

    await waitForSession(runtime.app, started.sessionId, (candidate) =>
      entryItems(candidate).some(
        (entry) => entry.kind === 'pi.assistant' && entryText(entry).length > 0,
      ),
    )
    await expect(runtime.sessions.watch(session.id, () => undefined)).rejects.toBeInstanceOf(
      AgentRuntimeError,
    )
  })

  it('replaces the prompt when an edit is submitted', async () => {
    const { session, view } = await runOnce('original request')
    const userEntry = entryItems(view)[0]

    const started = await runtime.app.editMessage({
      sessionId: session.id,
      entryId: userEntry!.id,
      prompt: 'edited request',
      mode: 'plan',
    })
    const edited = await waitForSession(runtime.app, started.sessionId, (candidate) =>
      entryItems(candidate).some(
        (entry) => entry.kind === KQ_USER_ENTRY_KIND && entryText(entry).includes('edited request'),
      ),
    )
    const firstEntry = entryItems(edited)[0]
    expect(firstEntry ? entryText(firstEntry) : '').toContain('edited request')
  })

  it('continues a context that still owes an answer without adding a user entry', async () => {
    const session = await runtime.app.createSession()
    const handle = await runtime.sessions.watch(session.id, () => undefined)
    await runtime.execution.harness.commit(
      (tx) =>
        tx.appendEntry(handle.conversation.id, {
          kind: 'pi.user',
          model: [{ role: 'user', content: 'answer the pending question', timestamp: 1 }],
        }),
      BACKGROUND_CONTEXT,
    )
    await handle.stop()
    await runtime.app.openSession(session.id)

    const started = await runtime.app.continueRun({ sessionId: session.id, mode: 'plan' })
    expect(started.sessionId).toBe(session.id)

    const view = await waitForSession(runtime.app, session.id, (candidate) =>
      entryItems(candidate).some(
        (entry) => entry.kind === 'pi.assistant' && entryText(entry).length > 0,
      ),
    )
    expect(entryItems(view).filter((entry) => entry.kind === 'pi.user')).toHaveLength(1)
  })

  it('records nothing_to_answer when a continue has nothing to answer', async () => {
    const { session } = await runOnce('summarize the current trend')

    await runtime.app.continueRun({ sessionId: session.id, mode: 'plan' })
    const view = await waitForSession(
      runtime.app,
      session.id,
      (candidate) => runFailureReason(candidate) !== undefined,
    )
    expect(runFailureReason(view)).toBe('nothing_to_answer')
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
