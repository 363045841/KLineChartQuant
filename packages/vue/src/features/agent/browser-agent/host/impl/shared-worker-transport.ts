/**
 * SharedWorker 传输：页面与宿主之间的唯一通道。
 *
 * worker 用稳定的构建产物 URL 创建，同一 origin 的所有页面因此共享同一个实例；
 * 不支持 SharedWorker 的环境直接报错，不退回页面内运行时。
 */

import {
  AGENT_HOST_PROTOCOL_VERSION,
  type AgentHostMessage,
  type AgentHostTransport,
  AgentRuntimeError,
  isAgentHostMessage,
} from '@363045841yyt/klinechart-agent-runtime/browser'

/**
 * 连接共享宿主 worker。
 * @returns 页面侧传输端口。
 * @throws {AgentRuntimeError} 当前环境没有 SharedWorker 时。
 */
export function connectSharedWorkerTransport(): AgentHostTransport {
  if (typeof SharedWorker === 'undefined')
    throw new AgentRuntimeError(
      'INTERNAL_ERROR',
      'The Agent requires SharedWorker support, which this browser does not provide.',
      { recommendedAction: 'Open the workbench in a browser that supports SharedWorker.' },
    )
  const worker = new SharedWorker(new URL('../agent-host.worker.ts', import.meta.url), {
    type: 'module',
    name: 'kq-agent-host',
  })
  const listeners = new Set<(message: AgentHostMessage) => void>()
  const errorListeners = new Set<(error: AgentRuntimeError) => void>()

  worker.port.onmessage = (event: MessageEvent) => {
    if (!isAgentHostMessage(event.data)) {
      const error = new AgentRuntimeError(
        'INVALID_PROTOCOL',
        'The Agent host sent an unsupported message.',
      )
      errorListeners.forEach((listener) => listener(error))
      return
    }
    listeners.forEach((listener) => listener(event.data))
  }
  // worker 脚本加载或启动失败时不会再有端口消息，这里把失败变成显式错误。
  worker.addEventListener('error', (event) => {
    const error = new AgentRuntimeError(
      'INTERNAL_ERROR',
      event.message || 'The Agent host worker failed to start.',
      { retryable: true, recommendedAction: 'Reload the page to restart the Agent host.' },
    )
    errorListeners.forEach((listener) => listener(error))
  })
  worker.port.start()

  // 页面关闭时主动断开：宿主据此让该页面发起但未完成的调用失败，
  // 而不是把运行永远挂在无人应答的等待里。
  globalThis.addEventListener('pagehide', () => {
    worker.port.postMessage({
      kind: 'detach',
      protocolVersion: AGENT_HOST_PROTOCOL_VERSION,
    })
  })

  return {
    post(message) {
      worker.port.postMessage(message)
    },
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
