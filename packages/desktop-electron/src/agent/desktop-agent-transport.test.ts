/** 桌面端 Agent 传输：消息搬运、入站校验与页面卸载断开。 */
import {
  AGENT_HOST_PROTOCOL_VERSION,
  type AgentHostTransport,
  AgentRuntimeError,
} from '@363045841yyt/klinechart-agent-runtime/browser'
import { describe, expect, it, vi } from 'vitest'

import type { AgentBridge } from '../../electron/agent-bridge'
import { connectDesktopAgentTransport } from './desktop-agent-transport'

/** 构造 preload 桥替身、独立作用域与向页面推送消息的入口。 */
function setup(): {
  bridge: AgentBridge
  transport: AgentHostTransport
  scope: EventTarget
  emit(message: unknown): void
} {
  const listeners = new Set<(message: unknown) => void>()
  const bridge: AgentBridge = {
    send: vi.fn(),
    onMessage: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const scope = new EventTarget()
  return {
    bridge,
    transport: connectDesktopAgentTransport(bridge, scope),
    scope,
    emit: (message) => listeners.forEach((listener) => listener(message)),
  }
}

describe('connectDesktopAgentTransport', () => {
  it('forwards page messages out and host messages back to subscribers', () => {
    const { bridge, transport, emit } = setup()
    const listener = vi.fn()
    transport.subscribe(listener)

    transport.post({
      kind: 'request',
      protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
      id: 'call-1',
      method: 'provider.snapshot',
      params: undefined,
    })
    expect(bridge.send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'request', id: 'call-1' }),
    )

    emit({ kind: 'response', id: 'call-1', ok: true, result: null })
    expect(listener).toHaveBeenCalledWith({
      kind: 'response',
      id: 'call-1',
      ok: true,
      result: null,
    })
  })

  it('reports an unsupported host message as a protocol error', () => {
    const { transport, emit } = setup()
    const listener = vi.fn()
    transport.onError(listener)

    emit({ kind: 'unsupported' })
    const error: unknown = listener.mock.calls[0]?.[0]
    expect(error).toBeInstanceOf(AgentRuntimeError)
    expect(error).toHaveProperty('code', 'INVALID_PROTOCOL')
  })

  it('detaches when the page unloads', () => {
    const { bridge, scope } = setup()
    scope.dispatchEvent(new Event('pagehide'))
    expect(bridge.send).toHaveBeenCalledWith({
      kind: 'detach',
      protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
    })
  })
})
