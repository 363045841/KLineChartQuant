/**
 * Agent IPC 的回归测试：来源门禁、载荷校验、按窗口接入与断开。
 *
 * 用 `ipcMain` 与 webContents 替身记录调用，不启动真实 Electron。
 */
import { AGENT_HOST_PROTOCOL_VERSION } from '@363045841yyt/klinechart-agent-runtime/browser'
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { AGENT_CHANNELS } from './agent-bridge'
import {
  type AgentIpcEvent,
  type AgentIpcHost,
  type AgentIpcSender,
  registerAgentIpc,
} from './agent-ipc'

/** 一条合法的页面请求；内容不影响本模块的判定。 */
const SNAPSHOT_REQUEST = {
  kind: 'request',
  protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
  id: 'call-1',
  method: 'provider.snapshot',
  params: undefined,
}

/** 构造一个可被销毁的 webContents 替身。 */
function createSender(id: number): {
  sender: AgentIpcSender
  destroy(): void
} {
  const destroyed = new Set<() => void>()
  return {
    sender: {
      id,
      isDestroyed: () => false,
      send: vi.fn(),
      once: (_event, listener) => {
        destroyed.add(listener)
      },
    },
    destroy() {
      destroyed.forEach((listener) => listener())
    },
  }
}

/** 收集注册的监听器与两侧替身。 */
function setup() {
  const listeners = new Map<string, (event: AgentIpcEvent, message: unknown) => void>()
  const attached = new Map<string, (message: unknown) => void>()
  const host: AgentIpcHost = {
    attachClient: vi.fn((clientId: string, send: (message: unknown) => void) => {
      attached.set(clientId, send)
    }),
    receive: vi.fn(),
    detachClient: vi.fn(async () => undefined),
  }
  const { sender, destroy } = createSender(1)
  registerAgentIpc({
    ipcMain: { on: (channel, listener) => listeners.set(channel, listener) },
    host,
    isTrustedSender: (event) => event.sender === sender,
  })
  const send = (
    message: unknown,
    event: AgentIpcEvent = { sender, senderFrame: { parent: null } },
  ) => listeners.get(AGENT_CHANNELS.client)!(event, message)
  return { host, sender, destroy, attached, send }
}

describe('registerAgentIpc — 来源门禁', () => {
  let consoleError: MockInstance

  beforeEach(() => {
    // 被拒绝的消息按约定记录日志，用例里静音但断言确实记录过。
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it.each<[string, (sender: AgentIpcSender) => AgentIpcEvent]>([
    ['窗口集合外的来源', () => ({ sender: createSender(2).sender, senderFrame: { parent: null } })],
    ['可信窗口的子 frame', (sender) => ({ sender, senderFrame: { parent: {} } })],
  ])('丢弃来自%s的 Agent 消息', (_label, createEvent) => {
    const { send, sender, host } = setup()
    expect(() => send(SNAPSHOT_REQUEST, createEvent(sender))).not.toThrow()
    expect(host.receive).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
  })

  it('drops payloads that are not Agent client messages', () => {
    const { send, host } = setup()
    expect(() => send({ kind: 'unsupported' })).not.toThrow()
    expect(host.receive).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
  })
})

describe('registerAgentIpc — 页面接入', () => {
  it('attaches a window once and routes every message with the same client id', () => {
    const { send, host, sender, attached } = setup()
    send(SNAPSHOT_REQUEST)
    send(SNAPSHOT_REQUEST)

    expect(host.attachClient).toHaveBeenCalledTimes(1)
    expect(host.receive).toHaveBeenCalledTimes(2)
    expect(host.receive).toHaveBeenCalledWith('1', SNAPSHOT_REQUEST)

    // 宿主写回该窗口时走专用通道，不直接触达渲染进程的 ipcRenderer。
    attached.get('1')!({ kind: 'response', id: 'call-1', ok: true, result: null })
    expect(sender.send).toHaveBeenCalledWith(AGENT_CHANNELS.host, {
      kind: 'response',
      id: 'call-1',
      ok: true,
      result: null,
    })
  })

  it('releases the window on destruction and reconnects on the next message', () => {
    const { send, host, destroy } = setup()
    send(SNAPSHOT_REQUEST)
    destroy()
    expect(host.detachClient).toHaveBeenCalledWith('1')

    send(SNAPSHOT_REQUEST)
    expect(host.attachClient).toHaveBeenCalledTimes(2)
  })
})
