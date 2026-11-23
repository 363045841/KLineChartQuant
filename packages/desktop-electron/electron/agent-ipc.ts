/**
 * Agent 宿主 IPC：把主进程里的 AgentHost 接到渲染进程，替代网页版的 SharedWorker 传输。
 *
 * 页面身份由主进程按 `webContents` 决定；入站消息只做信封校验，语义仍归协议层，
 * 与 `host-worker.ts` 的端口接入保持同一条边界。
 */
import {
  type AgentClientMessage,
  isAgentClientMessage,
} from '@363045841yyt/klinechart-agent-runtime/browser'

import { AGENT_CHANNELS } from './agent-bridge'
import { createMainFrameGuard, type TrustedIpcEvent } from './ipc-guard'

/** 本模块需要的 webContents 能力；`WebContents` 结构上满足它。 */
export interface AgentIpcSender {
  /** webContents 标识，作为宿主侧的页面身份。 */
  readonly id: number
  isDestroyed(): boolean
  send(channel: string, payload: unknown): void
  once(event: 'destroyed', listener: () => void): void
}

/** Agent 通道的事件形状，与其它主进程通道共用同一套来源门禁。 */
export interface AgentIpcEvent extends TrustedIpcEvent {
  readonly sender: AgentIpcSender
}

/** `ipcMain` 中本模块用到的部分，便于单测替换。 */
export interface AgentIpcMain {
  on(channel: string, listener: (event: AgentIpcEvent, message: unknown) => void): void
}

/** 宿主的最小接口；`AgentHost` 结构上满足它。 */
export interface AgentIpcHost {
  attachClient(clientId: string, send: (message: unknown) => void): void
  receive(clientId: string, message: AgentClientMessage): void
  detachClient(clientId: string): Promise<void>
}

/**
 * 注册 Agent 通道。
 *
 * @param options.ipcMain 主进程 IPC 注册入口
 * @param options.host 主进程内的宿主
 * @param options.isTrustedSender 判断事件来源是否属于窗口集合
 */
export function registerAgentIpc(options: {
  ipcMain: AgentIpcMain
  host: AgentIpcHost
  isTrustedSender: (event: TrustedIpcEvent) => boolean
}): void {
  const assertTrustedMainFrame = createMainFrameGuard(options.isTrustedSender)
  const attached = new Set<number>()

  options.ipcMain.on(AGENT_CHANNELS.client, (event, message) => {
    // `ipcMain.on` 的监听器抛出会冒成进程级未捕获异常，因此不合法输入只记录并丢弃。
    try {
      assertTrustedMainFrame(event)
    } catch (error) {
      console.error('[agent] Rejected an Agent IPC message from an untrusted sender.', error)
      return
    }
    if (!isAgentClientMessage(message)) {
      console.error('[agent] Rejected an Agent IPC message with an unsupported payload.')
      return
    }

    const sender = event.sender
    const clientId = String(sender.id)
    if (!attached.has(sender.id)) {
      attached.add(sender.id)
      options.host.attachClient(clientId, (out) => {
        if (!sender.isDestroyed()) sender.send(AGENT_CHANNELS.host, out)
      })
      // 窗口关闭后不再重连：租约与待应答调用由宿主按既有语义释放。
      sender.once('destroyed', () => {
        attached.delete(sender.id)
        void options.host.detachClient(clientId)
      })
    }
    options.host.receive(clientId, message)
  })
}
