/**
 * 桌面端 Agent 传输：页面消息经 preload 桥送进主进程宿主，替代网页版的 SharedWorker。
 *
 * 与 `shared-worker-transport.ts` 实现同一个端口契约：传输只负责搬运消息，
 * 语义、重试与状态都在宿主或客户端。
 */
import {
  AGENT_HOST_PROTOCOL_VERSION,
  type AgentHostMessage,
  type AgentHostTransport,
  AgentRuntimeError,
  isAgentHostMessage,
} from '@363045841yyt/klinechart-agent-runtime/browser'
import type { AgentBridge } from '../../electron/agent-bridge'

/**
 * 连接主进程宿主。
 *
 * @param bridge preload 暴露的 Agent 桥
 * @param scope 注册页面卸载监听的全局作用域，测试可注入替身
 * @returns 页面侧传输端口
 */
export function connectDesktopAgentTransport(
  bridge: AgentBridge,
  scope: Pick<typeof globalThis, 'addEventListener'> = globalThis,
): AgentHostTransport {
  const listeners = new Set<(message: AgentHostMessage) => void>()
  const errorListeners = new Set<(error: AgentRuntimeError) => void>()

  bridge.onMessage((message) => {
    if (!isAgentHostMessage(message)) {
      const error = new AgentRuntimeError(
        'INVALID_PROTOCOL',
        'The Agent host sent an unsupported message.',
      )
      errorListeners.forEach((listener) => listener(error))
      return
    }
    listeners.forEach((listener) => listener(message))
  })

  // 页面卸载时主动断开：宿主据此让该页面发起但未完成的调用失败，而不是永远挂起。
  scope.addEventListener('pagehide', () => {
    bridge.send({ kind: 'detach', protocolVersion: AGENT_HOST_PROTOCOL_VERSION })
  })

  return {
    post: (message) => bridge.send(message),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onError(listener) {
      errorListeners.add(listener)
      return () => errorListeners.delete(listener)
    },
  }
}
