/**
 * 窗口集合：存活窗口的唯一记录点。
 *
 * 负责来源信任、初始标签的一次性移交与工作区身份列表；窗口内容一律不在这里解释。
 */
import type { BrowserWindow } from 'electron'

import { nextAccentSlot } from './accent-slot'
import { createMainWindow } from './main-window'
import { WINDOW_CHANNELS, type WorkspaceTab } from './window-bridge'

interface WindowEntry {
  readonly window: BrowserWindow
  readonly workspaceId: string
  /** 工作区标识色槽位；同一时刻的窗口互不相同。 */
  readonly accentSlot: number
  /** 拖出窗口时暂存的标签；新窗口取走一次后清空。 */
  initialTabs: ReadonlyArray<WorkspaceTab> | null
}

export interface WindowSet {
  /** 当前存活窗口数。 */
  readonly size: number
  /** 新建窗口并登记；返回窗口本身供调用方决定显示时机。 */
  open(workspaceId: string, initialTabs?: ReadonlyArray<WorkspaceTab> | null): BrowserWindow
  /** 判断 IPC 来源是否属于窗口集合中的任一窗口。 */
  isTrustedSender(sender: unknown): boolean
  /** 按 IPC 来源反查窗口；来源不属于本集合时返回 null。 */
  windowOf(sender: unknown): BrowserWindow | null
  /** 取走某个窗口暂存的初始标签；重复调用返回 null。 */
  takeInitialTabs(sender: unknown): ReadonlyArray<WorkspaceTab> | null
  /** 聚焦任一存活窗口，供第二实例把用户带回已有界面。 */
  focusAny(): void
  /** 关闭指定工作区的窗口；工作区不存在时忽略。 */
  close(workspaceId: string): void
}

/**
 * 创建窗口集合。
 *
 * @param onWorkspaceChange 存活工作区发生变化时回调，用于落盘
 */
export function createWindowSet(
  onWorkspaceChange: (workspaceIds: ReadonlyArray<string>) => void,
): WindowSet {
  const entries = new Map<number, WindowEntry>()

  /** 按来源查找登记项。 */
  function entryOf(sender: unknown): WindowEntry | undefined {
    for (const entry of entries.values()) {
      if (entry.window.webContents === sender) return entry
    }
    return undefined
  }

  /** 当前存活窗口的工作区身份，顺序为创建顺序。 */
  function workspaceIds(): ReadonlyArray<string> {
    return [...entries.values()].map((entry) => entry.workspaceId)
  }

  function open(workspaceId: string, initialTabs: ReadonlyArray<WorkspaceTab> | null = null) {
    const accentSlot = nextAccentSlot(
      new Set([...entries.values()].map((entry) => entry.accentSlot)),
    )
    const window = createMainWindow(workspaceId, accentSlot)
    const entry: WindowEntry = { window, workspaceId, accentSlot, initialTabs }
    entries.set(window.id, entry)
    // 最大化状态变化由主进程推送，渲染进程据此切换按钮图标。
    window.on('maximize', () => {
      window.webContents.send(WINDOW_CHANNELS.windowStateChanged, true)
    })
    window.on('unmaximize', () => {
      window.webContents.send(WINDOW_CHANNELS.windowStateChanged, false)
    })
    window.on('closed', () => {
      entries.delete(window.id)
      onWorkspaceChange(workspaceIds())
    })
    onWorkspaceChange(workspaceIds())
    return window
  }

  return {
    get size() {
      return entries.size
    },
    open,
    isTrustedSender: (sender) => entryOf(sender) !== undefined,
    windowOf: (sender) => entryOf(sender)?.window ?? null,
    takeInitialTabs(sender) {
      const entry = entryOf(sender)
      if (!entry?.initialTabs) return null
      const tabs = entry.initialTabs
      entry.initialTabs = null
      return tabs
    },
    focusAny() {
      const window = [...entries.values()].at(-1)?.window
      if (!window) return
      if (window.isMinimized()) window.restore()
      window.focus()
    },
    close(workspaceId) {
      for (const entry of entries.values()) {
        if (entry.workspaceId !== workspaceId) continue
        entry.window.close()
        return
      }
    },
  }
}
