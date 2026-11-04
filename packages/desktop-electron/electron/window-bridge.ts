/**
 * preload 与渲染进程共享的窗口契约。
 *
 * 与 `credential-bridge.ts` 一样，本文件不得依赖任何 node 内置模块：
 * sandbox preload 只能加载 `electron`。
 */

/** 挂在 `window` 上的窗口桥名称。 */
export const WINDOW_BRIDGE_KEY = 'klinechartWindow'

/** 标题栏高度（逻辑像素）；主进程 WCO 与渲染进程布局共用同一个值。 */
export const TITLEBAR_HEIGHT = 28

/** 渲染进程可见的窗口 channel；名称带包前缀，避免与其它 IPC 冲突。 */
export const WINDOW_CHANNELS = {
  setTitleBarTheme: 'klinechart:window:set-title-bar-theme',
} as const

/** 有效主题；原生窗口按钮的颜色只能二选一。 */
export type WindowTheme = 'light' | 'dark'

/** preload 暴露的窗口能力；只有配色同步与宿主信息。 */
export interface WindowBridge {
  /** 宿主平台，macOS 需要给系统红绿灯让出位置。 */
  readonly platform: string
  /** 标题栏高度，渲染进程据此设置布局变量。 */
  readonly titleBarHeight: number
  /** 同步原生窗口按钮配色；WCO 由系统绘制，读不到页面 CSS 变量。 */
  setTitleBarTheme(theme: WindowTheme): Promise<void>
}
