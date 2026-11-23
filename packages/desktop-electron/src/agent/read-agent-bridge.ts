/** 渲染侧的 Agent 桥接：读取 preload 注入的宿主通道。 */
import { AGENT_BRIDGE_KEY, type AgentBridge } from '../../electron/agent-bridge'

/**
 * 读取 preload 注入的 Agent 桥。
 *
 * @param scope 全局作用域，测试可注入替身
 * @returns 通过形状校验的 Agent 桥；缺失或残缺时返回 undefined
 */
export function readAgentBridge(scope: unknown = globalThis): AgentBridge | undefined {
  const bridge = (scope as Record<string, unknown> | undefined)?.[AGENT_BRIDGE_KEY]
  if (!bridge || typeof bridge !== 'object') return undefined
  const candidate = bridge as Partial<AgentBridge>
  const complete = typeof candidate.send === 'function' && typeof candidate.onMessage === 'function'
  return complete ? (candidate as AgentBridge) : undefined
}
