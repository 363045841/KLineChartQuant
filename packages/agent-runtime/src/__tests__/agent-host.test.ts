// 宿主与页面客户端：会话、工具状态、提问路由、传输失败与序列化边界。
import { describe, expect, it } from 'vitest'
import { AGENT_HOST_PROTOCOL_VERSION, createAgentHostClient } from '../browser.js'
import { AgentRuntimeError } from '../contracts/errors.js'
import type { AgentClientMessage, AgentHostMessage } from '../host/protocol.js'
import { createHostClient } from '../testing/host-client.js'

/** 不含图表能力的工具端口，供不需要图表的用例使用。 */
const noTools = {
  metadata: () => [],
  catalog: () => [],
  execute: async () => {
    throw new AgentRuntimeError('TOOL_NOT_ALLOWED', 'The test client has no chart tools.')
  },
}

/** 构造一条宿主发起的提问请求。 */
function hostRequest(
  id: string,
  params: {
    questionId: string
    sessionId: string
    toolCallId: string
    prompt: string
    options: { value: string; label: string }[]
    multiSelect: boolean
  },
): AgentHostMessage {
  return {
    kind: 'request',
    protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
    id,
    method: 'questions.ask',
    params,
  }
}

describe('AgentHost session protocol', () => {
  it('lists the session created on first access', async () => {
    const pair = await createHostClient()
    const sessions = await pair.client.listSessions()
    expect(sessions).toHaveLength(1)
    await pair.dispose()
  })

  it('creates and opens a session', async () => {
    const pair = await createHostClient()
    const created = await pair.client.createSession()
    const lease = await pair.client.openSession(created.id)
    expect(lease.transcript.conversation).toBeDefined()
    await lease.release()
    await pair.dispose()
  })

  it('keeps a session open until its last lease is released', async () => {
    const pair = await createHostClient()
    const events: string[] = []
    pair.client.subscribe((event) => events.push(event.type))
    const session = await pair.client.createSession()
    const first = await pair.client.openSession(session.id)
    const second = await pair.client.openSession(session.id)

    await first.release()
    expect(events).not.toContain('session.closed')

    await second.release()
    expect(events).toContain('session.closed')
    await pair.dispose()
  })
})

describe('transport wiring', () => {
  it('settles a call delivered through the transport without external wiring', async () => {
    const sent: AgentClientMessage[] = []
    let deliver: ((message: AgentHostMessage) => void) | undefined
    const client = createAgentHostClient({
      transport: {
        post: (message) => {
          sent.push(message)
          // 宿主立刻回一条应答，客户端必须自己收得到。
          deliver?.({
            kind: 'response',
            id: message.kind === 'request' ? message.id : '',
            ok: true,
            result: [],
          })
        },
        subscribe: (listener) => {
          deliver = listener
          return () => undefined
        },
        onError: () => () => undefined,
      },
      toolHost: noTools,
    })

    await expect(client.listSessions()).resolves.toEqual([])
    expect(sent).toHaveLength(1)
  })

  it('fails pending calls through the transport error port', async () => {
    let fail: ((error: AgentRuntimeError) => void) | undefined
    const client = createAgentHostClient({
      transport: {
        post: () => undefined,
        subscribe: () => () => undefined,
        onError: (listener) => {
          fail = listener
          return () => undefined
        },
      },
      toolHost: noTools,
    })

    const pending = client.createSession()
    fail?.(new AgentRuntimeError('ABORTED', 'The Agent transport is gone.'))
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' })
  })

  it('rejects a payload that cannot cross the thread boundary', async () => {
    const pair = await createHostClient()
    const proxyInput = new Proxy({}, {})
    await expect(pair.client.debugTool('web_search', proxyInput)).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
      message: 'The request could not be serialized for the Agent host.',
    })
    await pair.dispose()
  })
})

describe('AgentHost tool state', () => {
  it('starts with every tool enabled and persists an explicit selection', async () => {
    const pair = await createHostClient()
    const initial = await pair.client.listTools()
    expect(initial.map((tool) => tool.name).sort()).toEqual(['ask_user', 'web_search'])
    expect(initial.every((tool) => tool.enabled)).toBe(true)

    await pair.client.setToolEnabled('web_search', false)
    const afterDisable = await pair.client.listTools()
    expect(afterDisable.find((tool) => tool.name === 'web_search')?.enabled).toBe(false)
    expect(afterDisable.find((tool) => tool.name === 'ask_user')?.enabled).toBe(true)

    await pair.client.setToolEnabled('ask_user', false)
    const allDisabled = await pair.client.listTools()
    expect(allDisabled.every((tool) => tool.enabled)).toBe(false)
    await pair.dispose()
  })
})

describe('page-side question routing', () => {
  it('renders the host question and answers it over the same request', async () => {
    const pair = await createHostClient()
    const events: string[] = []
    pair.client.subscribe((event) => events.push(event.type))

    pair.deliver(
      hostRequest('r-1', {
        questionId: 'q-1',
        sessionId: 's-1',
        toolCallId: 'call-1',
        prompt: 'Pick a market',
        options: [{ value: 'SSE', label: 'Shanghai' }],
        multiSelect: false,
      }),
    )
    expect(events).toEqual(['tool.question.required'])

    await pair.client.answerQuestion('q-1', { selectedValues: ['SSE'] })
    expect(events).toEqual(['tool.question.required', 'tool.question.resolved'])
    await pair.dispose()
  })

  it('settles a dismissed question as cancelled', async () => {
    const pair = await createHostClient()
    const statuses: string[] = []
    pair.client.subscribe((event) => {
      if (event.type === 'tool.question.resolved') statuses.push(event.status)
    })
    pair.deliver(
      hostRequest('r-2', {
        questionId: 'q-2',
        sessionId: 's-1',
        toolCallId: 'call-2',
        prompt: 'Pick a market',
        options: [{ value: 'SSE', label: 'Shanghai' }],
        multiSelect: false,
      }),
    )
    pair.deliver({
      kind: 'question.dismiss',
      protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
      questionId: 'q-2',
    })
    expect(statuses).toEqual(['cancelled'])
    await pair.dispose()
  })
})

describe('transport failure', () => {
  it('fails every pending call when the transport breaks', async () => {
    const pair = await createHostClient()
    const pending = pair.client.createSession()
    pair.breakTransport()
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' })
    await pair.dispose()
  })
})
