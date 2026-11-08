/**
 * preload、渲染进程与主进程共享的窗口契约。
 *
 * 与 `credential-bridge.ts` 一样，本文件不得依赖任何 node 内置模块：
 * sandbox preload 只能加载 `electron`。
 */
import type { SymbolSpec } from '@363045841yyt/klinechart-core/controllers'

/** 挂在 `window` 上的窗口桥名称。 */
export const WINDOW_BRIDGE_KEY = 'klinechartWindow'

/** 标题栏高度（逻辑像素）；主进程 WCO 与渲染进程布局共用同一个值。 */
export const TITLEBAR_HEIGHT = 40

/** 渲染进程可见的窗口 channel；名称带包前缀，避免与其它 IPC 冲突。 */
export const WINDOW_CHANNELS = {
  setTitleBarTheme: 'klinechart:window:set-title-bar-theme',
  openWindow: 'klinechart:window:open',
  closeWorkspace: 'klinechart:window:close-workspace',
  consumeInitialTabs: 'klinechart:window:consume-initial-tabs',
  adoptTab: 'klinechart:window:adopt-tab',
  workspaceChanged: 'klinechart:window:workspace-changed',
} as const

/** 有效主题；原生窗口按钮的颜色只能二选一。 */
export type WindowTheme = 'light' | 'dark'

/**
 * 判断值是否为可用的图表品种描述。
 *
 * 只校验加载数据所需的字段；其余字段由图表原样使用，这里不做二次构造。
 */
export function isSymbolSpec(value: unknown): value is SymbolSpec {
  if (typeof value !== 'object' || value === null) return false
  const spec = value as Record<string, unknown>
  return (
    typeof spec.symbol === 'string' &&
    spec.symbol.length > 0 &&
    typeof spec.market === 'string' &&
    spec.market.length > 0
  )
}

/**
 * 标签页快照。
 *
 * 主进程只在窗口之间搬运这份数据，不解释、不改写：标签内容归渲染进程所有。
 */
export interface WorkspaceTab {
  readonly id: string
  /** 标签标题，取当前品种代码；空标签页使用默认标题。 */
  readonly label: string
  /** 图表完整的品种描述；恢复时直接写回图表，不经过数据源解析。 */
  readonly spec: SymbolSpec | null
}

/** preload 暴露的窗口能力。 */
export interface WindowBridge {
  /** 宿主平台，macOS 需要给系统红绿灯让出位置。 */
  readonly platform: string
  /** 标题栏高度，渲染进程据此设置布局变量。 */
  readonly titleBarHeight: number
  /** 同步原生窗口按钮配色；WCO 由系统绘制，读不到页面 CSS 变量。 */
  setTitleBarTheme(theme: WindowTheme): Promise<void>
  /** 新建窗口；tabs 缺省表示开一扇空白窗口，提供时表示把这些标签整体移交过去。 */
  openWindow(tabs?: ReadonlyArray<WorkspaceTab>): Promise<void>
  /** 关闭某个工作区对应的窗口；标签被其它窗口接管到空时使用。 */
  closeWorkspace(workspaceId: string): Promise<void>
  /** 取走本窗口的初始标签（拖出窗口时由主进程暂存）；没有时返回 null。 */
  consumeInitialTabs(): Promise<ReadonlyArray<WorkspaceTab> | null>
  /** 把某个工作区的标签接管到本窗口；主进程随后通知所有窗口重新读取。 */
  adoptTab(request: { readonly fromWorkspaceId: string; readonly tabId: string }): Promise<void>
  /** 订阅工作区变化通知；返回退订函数。 */
  onWorkspaceChanged(listener: () => void): () => void
}
