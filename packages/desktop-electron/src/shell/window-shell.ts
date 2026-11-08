/**
 * 渲染侧的窗口桥接：读取 preload 注入的能力，外壳据此决定是否渲染标签栏。
 */
import { WINDOW_BRIDGE_KEY, type WindowBridge } from '../../electron/window-bridge'

/**
 * 读取 preload 注入的窗口桥。
 *
 * 普通浏览器宿主或单元测试里没有 bridge，返回 undefined，外壳据此不渲染标签栏。
 *
 * @param scope 全局作用域，测试可注入替身
 * @returns 通过形状校验的窗口桥；缺失或残缺时返回 undefined
 */
export function readWindowShell(scope: unknown = globalThis): WindowBridge | undefined {
  const bridge = (scope as Record<string, unknown> | undefined)?.[WINDOW_BRIDGE_KEY]
  if (!bridge || typeof bridge !== 'object') return undefined
  const candidate = bridge as Partial<WindowBridge>
  const complete =
    typeof candidate.platform === 'string' &&
    typeof candidate.titleBarHeight === 'number' &&
    Number.isFinite(candidate.titleBarHeight) &&
    candidate.titleBarHeight > 0 &&
    typeof candidate.minimize === 'function' &&
    typeof candidate.toggleMaximize === 'function' &&
    typeof candidate.close === 'function' &&
    typeof candidate.getWindowState === 'function' &&
    typeof candidate.onMaximizedChanged === 'function' &&
    typeof candidate.openWindow === 'function' &&
    typeof candidate.closeWorkspace === 'function' &&
    typeof candidate.consumeInitialTabs === 'function' &&
    typeof candidate.adoptTab === 'function' &&
    typeof candidate.onWorkspaceChanged === 'function'
  return complete ? (candidate as WindowBridge) : undefined
}

/**
 * 读取本窗口的工作区身份。
 *
 * 身份由主进程在加载窗口时经 URL 下发；缺失说明渲染进程不是由主进程创建的，
 * 直接失败而不是退回到“默认工作区”，否则两个窗口会写同一份标签数据。
 *
 * @param search 当前页面查询串
 * @returns 工作区身份
 */
export function readWorkspaceId(search: string = globalThis.location.search): string {
  const workspaceId = new URLSearchParams(search).get('workspace')
  if (!workspaceId) {
    throw new Error('The desktop window is missing its workspace id.')
  }
  return workspaceId
}

/**
 * 读取本窗口的工作区标识色槽位。
 *
 * 槽位由主进程分配，保证同时打开的窗口不撞色；缺失说明窗口不是由主进程创建的，
 * 直接失败而不是回退到某个固定颜色。
 *
 * @param search 当前页面查询串
 * @returns 非负整数槽位
 */
export function readWorkspaceAccent(search: string = globalThis.location.search): number {
  const value = new URLSearchParams(search).get('accent')
  // 缺失时不能走 Number(null) === 0，否则所有窗口都会落到第一个色槽。
  const slot = value === null ? Number.NaN : Number(value)
  if (!Number.isInteger(slot) || slot < 0) {
    throw new Error('The desktop window is missing its accent slot.')
  }
  return slot
}
