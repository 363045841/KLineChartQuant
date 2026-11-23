/**
 * preload、渲染进程与主进程共享的 Agent 桥契约。
 *
 * 与 `window-bridge.ts` 一样，本文件不得依赖任何 node 内置模块：sandbox preload
 * 只能加载 `electron`。载荷在这里只描述「怎么过线」，消息语义归 Agent 协议。
 */

/** 挂在 `window` 上的 Agent 桥名称。 */
export const AGENT_BRIDGE_KEY = 'klinechartAgent'

/** Agent 通道；上行页面消息，下行宿主消息。 */
export const AGENT_CHANNELS = {
  client: 'klinechart:agent:client',
  host: 'klinechart:agent:host',
} as const

/** preload 暴露的 Agent 能力：只收发协议消息，不暴露 `ipcRenderer` 本身。 */
export interface AgentBridge {
  /** 发送一条页面消息到主进程宿主。 */
  send(message: unknown): void
  /** 订阅宿主消息；返回退订函数。 */
  onMessage(listener: (message: unknown) => void): () => void
}
