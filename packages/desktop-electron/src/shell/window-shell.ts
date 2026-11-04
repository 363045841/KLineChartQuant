/**
 * 渲染侧的窗口桥接：读取 preload 注入的能力，外壳据此决定是否渲染标题栏。
 */
import { WINDOW_BRIDGE_KEY, type WindowBridge } from '../../electron/window-bridge'

/**
 * 读取 preload 注入的窗口桥。
 *
 * 普通浏览器宿主或单元测试里没有 bridge，返回 undefined，外壳据此不渲染标题栏。
 *
 * @param scope 全局作用域，测试可注入替身
 * @returns 通过形状校验的窗口桥；缺失或残缺时返回 undefined
 */
export function readWindowShell(scope: unknown = globalThis): WindowBridge | undefined {
  const bridge = (scope as Record<string, unknown> | undefined)?.[WINDOW_BRIDGE_KEY]
  if (!bridge || typeof bridge !== 'object') return undefined
  const candidate = bridge as Partial<WindowBridge>
  return typeof candidate.platform === 'string' &&
    typeof candidate.titleBarHeight === 'number' &&
    Number.isFinite(candidate.titleBarHeight) &&
    candidate.titleBarHeight > 0 &&
    typeof candidate.setTitleBarTheme === 'function'
    ? (candidate as WindowBridge)
    : undefined
}
