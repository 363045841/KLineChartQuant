/**
 * 测试用宿主客户端：真实 `AgentHost` + 真实页面客户端，消息经过结构化克隆。
 *
 * 与浏览器一致：跨线程载荷必须先可克隆，否则在发送端就失败。测试因此覆盖真实的
 * 传输语义（可克隆性、应答路由、传输中断），不再维护第二套进程内实现。
 */

import { type AgentHostClient, createAgentHostClient } from '../browser/client.js'
import type { AgentClientToolHost } from '../browser/types.js'
import { AgentRuntimeError } from '../contracts/errors.js'
import type { ProviderAdmin, ProviderSnapshot } from '../contracts/provider.js'
import { AgentHost } from '../host/impl/agent-host.js'
import { AgentSettingsStore } from '../host/impl/agent-settings.js'
import type { AgentSettingsStorage } from '../host/settings.js'
import type { AgentClientMessage, AgentHostMessage } from '../host/protocol.js'
import { createMemoryRuntimeSessions } from './memory-sessions.js'

/** 内存设置存储；读不到时返回 null，与 IndexedDB 实现一致。 */
function createMemorySettingsStorage(initial: unknown = null): AgentSettingsStorage {
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

/** 建立测试宿主连接的选项。 */
export interface HostClientOptions {
  /** 初始设置文档；省略表示从未写入。 */
  initialSettings?: unknown
  /** 可替换的 fetch；未提供时任何网络请求都会真实发出。 */
  fetch?: typeof globalThis.fetch
}

/** 一套已连接的宿主与页面客户端。 */
export interface HostClientPair {
  readonly host: AgentHost
  readonly client: AgentHostClient & ProviderAdmin
  /** 让消息走与生产一致的结构化克隆边界。 */
  readonly storage: AgentSettingsStorage
  /** 模拟宿主发来的消息。 */
  deliver(message: AgentHostMessage): void
  /** 等待已排队的消息全部送达。 */
  settle(): Promise<void>
  /** 模拟传输中断，让所有待办失败。 */
  breakTransport(): void
  dispose(): Promise<void>
}

/**
 * 建立宿主与页面客户端的内存连接。
 * @returns 已连接的一对端点与关闭函数。
 */
export async function createHostClient(options: HostClientOptions = {}): Promise<HostClientPair> {
  const storage = createMemorySettingsStorage(options.initialSettings ?? null)
  const host = new AgentHost({
    settings: new AgentSettingsStore(storage, () => `pf_test_${crypto.randomUUID()}`),
    createSessions: createMemoryRuntimeSessions,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  })
  const listeners = new Set<(message: AgentHostMessage) => void>()
  const errorListeners = new Set<(error: AgentRuntimeError) => void>()
  let broken = false

  host.attachClient('test-client', (message) => {
    queueMicrotask(() => {
      if (broken) return
      const delivered = structuredClone(message)
      listeners.forEach((listener) => listener(delivered))
    })
  })

  const client = createAgentHostClient({
    transport: {
      post: (message: AgentClientMessage) => {
        if (broken) return
        const delivered = structuredClone(message)
        queueMicrotask(() => host.receive('test-client', delivered))
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
    storage,
    deliver(message) {
      listeners.forEach((listener) => listener(structuredClone(message)))
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

/** 构造一份最小可用的 Provider 快照初始文档。 */
export function providerSettingsDocument(
  overrides: { models?: readonly { id: string; name: string }[] } = {},
): unknown {
  return {
    version: 3,
    revision: 1,
    disabledTools: [],
    profiles: [
      {
        id: 'pf_main',
        name: 'Default',
        apiKey: 'test-key',
        active: true,
        connectionRevision: 1,
        connection: {
          baseUrl: 'https://provider.example.test/v1',
          headers: {},
          protocol: 'openai-responses',
        },
        models: (overrides.models ?? []).map((model) => ({
          id: model.id,
          name: model.name,
          maxOutputTokens: 8_192,
          reasoningEfforts: [],
        })),
      },
    ],
  }
}
