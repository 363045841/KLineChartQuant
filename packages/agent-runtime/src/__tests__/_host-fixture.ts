// 宿主测试夹具：内存传输把宿主与页面客户端接在一起，不触碰浏览器存储。
import { type AgentHostClient, createAgentHostClient } from '../browser/client.js'
import type { AgentClientToolHost } from '../browser/types.js'
import { AgentRuntimeError } from '../contracts/errors.js'
import { AgentHost } from '../host/impl/agent-host.js'
import { type AgentSettingsStorage, AgentSettingsStore } from '../host/impl/agent-settings.js'
import type { AgentClientMessage, AgentHostMessage } from '../host/protocol.js'
import { AGENT_HOST_PROTOCOL_VERSION } from '../host/protocol.js'
import { createMemoryRuntimeSessions } from '../testing/memory-sessions.js'

/** 内存设置存储；读不到时返回 null，与 IndexedDB 实现一致。 */
function createMemoryStorage(initial: unknown = null): AgentSettingsStorage {
  let value = initial
  return {
    async read() {
      return value
    },
    async write(document) {
      value = document
    },
  }
}

/** 无图表能力的空工具端口。 */
const emptyToolHost: AgentClientToolHost = {
  metadata: () => [],
  catalog: () => [],
  execute: async () => {
    throw new AgentRuntimeError('TOOL_NOT_ALLOWED', 'The test client has no chart tools.')
  },
}

/** 一次宿主与页面客户端的连接。 */
export interface HostPair {
  readonly host: AgentHost
  readonly client: AgentHostClient
  /** 模拟宿主发来的消息，走与生产一致的传输链路。 */
  deliver(message: AgentHostMessage): void
  /** 等待已排队的消息全部送达。 */
  settle(): Promise<void>
  /** 模拟传输中断，让所有待办失败。 */
  breakTransport(): void
  dispose(): Promise<void>
}

/**
 * 建立宿主与客户端的内存连接。
 * @returns 已连接的一对端点与关闭函数。
 */
export async function buildHostPair(): Promise<HostPair> {
  const host = new AgentHost({
    settings: new AgentSettingsStore(createMemoryStorage()),
    createSessions: createMemoryRuntimeSessions,
  })
  const listeners = new Set<(message: AgentHostMessage) => void>()
  const errorListeners = new Set<(error: AgentRuntimeError) => void>()
  let broken = false

  host.attachClient('test-client', (message) => {
    queueMicrotask(() => {
      if (broken) return
      listeners.forEach((listener) => listener(message))
    })
  })

  const client = createAgentHostClient({
    transport: {
      post: (message: AgentClientMessage) => {
        if (broken) return
        queueMicrotask(() => host.receive('test-client', message))
      },
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      onError: (listener) => {
        errorListeners.add(listener)
        return () => errorListeners.delete(listener)
      },
    },
    toolHost: emptyToolHost,
  })

  return {
    host,
    client,
    deliver(message) {
      listeners.forEach((listener) => listener(message))
    },
    async settle() {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    },
    breakTransport() {
      broken = true
      const error = new AgentRuntimeError('ABORTED', 'The Agent transport is gone.')
      errorListeners.forEach((listener) => listener(error))
    },
    async dispose() {
      broken = true
      await host.close()
    },
  }
}

/** 发送一条宿主请求；供需要模拟宿主调用的用例使用。 */
export function hostRequest(
  id: string,
  method: 'questions.ask',
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
    method,
    params,
  }
}
