/**
 * SharedWorker 侧的宿主接入：每个 `connect` 端口对应一个页面会话。
 *
 * 一个 origin 只有一个 SharedWorker 实例，因此宿主天然是单例；页面断开只会
 * 移除该页面的待办，不会影响其它页面或正在运行的任务。
 */

import { AgentRuntimeError } from '../../contracts/errors.js'
import { AgentHost } from '../../host/impl/agent-host.js'
import { isAgentClientMessage } from '../../host/protocol.js'
import type { AgentHostOptions } from '../../host/types.js'

/**
 * 把一个 MessagePort 接入宿主。
 * @param host 宿主实例。
 * @param port 页面端口。
 * @param createId 客户端标识生成器。
 * @returns 分配给该页面的 clientId。
 */
function attachAgentHostPort(
  host: AgentHost,
  port: MessagePort,
  createId: () => string = () => crypto.randomUUID(),
): string {
  const clientId = createId()
  host.attachClient(clientId, (message) => port.postMessage(message))
  port.onmessage = (event: MessageEvent) => {
    if (!isAgentClientMessage(event.data)) {
      port.postMessage({
        kind: 'response',
        id: '',
        ok: false,
        error: new AgentRuntimeError('INVALID_PAYLOAD', 'Unsupported Agent host message.').toView(),
      })
      return
    }
    host.receive(clientId, event.data)
  }
  port.onmessageerror = () => host.detachClient(clientId)
  port.start()
  return clientId
}

/**
 * 在 SharedWorker 中启动宿主，并接受所有页面连接。
 * @param options 宿主依赖。
 * @returns 宿主实例，便于宿主自行关闭。
 */
export function startAgentHostInSharedWorker(options: AgentHostOptions): AgentHost {
  const host = new AgentHost(options)
  const scope: EventTarget = globalThis
  scope.addEventListener('connect', (event) => {
    if (!(event instanceof MessageEvent)) {
      throw new AgentRuntimeError(
        'INVALID_PROTOCOL',
        'The Agent host received a non-port connect event.',
      )
    }
    for (const port of event.ports) attachAgentHostPort(host, port, options.createId)
  })
  return host
}
