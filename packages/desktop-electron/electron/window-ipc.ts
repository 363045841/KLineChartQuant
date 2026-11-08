/**
 * 窗口相关 IPC：窗口控制、最大化状态、新建窗口与标签移交。
 *
 * 所有通道共用同一套来源门禁：只有窗口集合内的主 frame 可以调用，
 * 窗口实例按事件来源反查，不再绑定某一个“主窗口”。
 */
import { createMainFrameGuard, type TrustedIpcEvent } from './ipc-guard'
import { isSymbolSpec, WINDOW_CHANNELS, type WorkspaceTab } from './window-bridge'

/** 窗口 IPC 的事件形状，与其它主进程通道共用同一套来源门禁。 */
export type WindowIpcEvent = TrustedIpcEvent

/** `ipcMain` 中本模块用到的部分，便于单测替换。 */
export interface IpcMainLike {
  handle(channel: string, listener: (event: WindowIpcEvent, ...args: unknown[]) => unknown): void
}

/** 本模块需要的窗口能力；`BrowserWindow` 结构上满足它，单测可注入替身。 */
export interface WindowActions {
  minimize(): void
  maximize(): void
  unmaximize(): void
  isMaximized(): boolean
  close(): void
}

/** 判断 IPC 传入的标签快照是否完整；不完整直接失败，不做静默丢弃。 */
function readWorkspaceTabs(value: unknown): ReadonlyArray<WorkspaceTab> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('The new window must receive at least one tab.')
  }
  return value.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) {
      throw new TypeError('A transferred tab must be an object.')
    }
    const { id, label, spec } = item as Record<string, unknown>
    if (typeof id !== 'string' || id.length === 0 || typeof label !== 'string') {
      throw new TypeError('A transferred tab needs an id and a label.')
    }
    if (spec === null) return { id, label, spec: null }
    if (!isSymbolSpec(spec)) {
      throw new TypeError('A transferred tab spec must be a chart symbol spec or null.')
    }
    return { id, label, spec }
  })
}

/**
 * 注册窗口 handler。
 *
 * @param options.ipcMain 主进程 IPC 注册入口
 * @param options.getWindow 按事件来源反查窗口；来源不可信时返回 null
 * @param options.isTrustedSender 判断事件来源是否属于窗口集合
 * @param options.createWindow 新建窗口；提供标签时表示接管这些标签
 * @param options.closeWorkspace 关闭某个工作区的窗口
 * @param options.takeInitialTabs 取走某个窗口的初始标签
 * @param options.notifyWorkspaceChanged 通知所有窗口重新读取标签页集合
 */
export function registerWindowIpc(options: {
  ipcMain: IpcMainLike
  getWindow: (event: WindowIpcEvent) => WindowActions | null
  isTrustedSender: (event: WindowIpcEvent) => boolean
  createWindow: (tabs?: ReadonlyArray<WorkspaceTab>) => void
  closeWorkspace: (workspaceId: string) => void
  takeInitialTabs: (event: WindowIpcEvent) => ReadonlyArray<WorkspaceTab> | null
  notifyWorkspaceChanged: () => void
}): void {
  const assertTrustedMainFrame = createMainFrameGuard(options.isTrustedSender)

  /** 取来源窗口；来源可信但窗口已销毁时明确失败。 */
  function requireWindow(event: WindowIpcEvent): WindowActions {
    const window = options.getWindow(event)
    if (!window) throw new Error('The window is not available.')
    return window
  }

  options.ipcMain.handle(WINDOW_CHANNELS.minimizeWindow, async (event) => {
    assertTrustedMainFrame(event)
    requireWindow(event).minimize()
    return null
  })

  options.ipcMain.handle(WINDOW_CHANNELS.toggleMaximizeWindow, async (event) => {
    assertTrustedMainFrame(event)
    const window = requireWindow(event)
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return null
  })

  options.ipcMain.handle(WINDOW_CHANNELS.closeWindow, async (event) => {
    assertTrustedMainFrame(event)
    requireWindow(event).close()
    return null
  })

  options.ipcMain.handle(WINDOW_CHANNELS.getWindowState, async (event) => {
    assertTrustedMainFrame(event)
    return { maximized: requireWindow(event).isMaximized() }
  })

  options.ipcMain.handle(WINDOW_CHANNELS.openWindow, async (event, tabs) => {
    assertTrustedMainFrame(event)
    options.createWindow(tabs === undefined ? undefined : readWorkspaceTabs(tabs))
    return null
  })

  options.ipcMain.handle(WINDOW_CHANNELS.consumeInitialTabs, async (event) => {
    assertTrustedMainFrame(event)
    return options.takeInitialTabs(event)
  })

  options.ipcMain.handle(WINDOW_CHANNELS.closeWorkspace, async (event, workspaceId) => {
    assertTrustedMainFrame(event)
    if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
      throw new TypeError('A workspace to close needs its id.')
    }
    options.closeWorkspace(workspaceId)
    return null
  })

  options.ipcMain.handle(WINDOW_CHANNELS.adoptTab, async (event, request) => {
    assertTrustedMainFrame(event)
    if (typeof request !== 'object' || request === null) {
      throw new TypeError('An adopted tab needs its source workspace and tab id.')
    }
    const { fromWorkspaceId, tabId } = request as Record<string, unknown>
    if (typeof fromWorkspaceId !== 'string' || typeof tabId !== 'string') {
      throw new TypeError('An adopted tab needs its source workspace and tab id.')
    }
    // 标签数据由渲染进程在共享存储里搬运完成，主进程只广播“工作区已变化”。
    options.notifyWorkspaceChanged()
    return null
  })
}
