/**
 * Windows / Linux 的 Window Controls Overlay 配色。
 *
 * WCO 由系统绘制在页面之上，读不到页面 CSS 变量，只能在主进程给出具体色值。
 * 这里的两组色值对应当前主题的 `--klc-color-background` 与 `--klc-color-text`
 * （见 core 的 `foundation/tokens/interface-colors.ts`），改主题时同步这一处。
 */
import { TITLEBAR_HEIGHT, type WindowTheme } from './window-bridge'

/** 每个主题下覆盖层的底色与按钮颜色。 */
export const TITLEBAR_THEMES: Record<WindowTheme, { color: string; symbolColor: string }> = {
  light: { color: '#F5F5F7', symbolColor: '#242426' },
  dark: { color: '#151619', symbolColor: '#DCE0E8' },
}

/** 写入 WCO 所需的窗口子集，便于单测注入替身。 */
export interface TitleBarTarget {
  setTitleBarOverlay(options: { color?: string; symbolColor?: string; height?: number }): void
}

/**
 * 把主题落到窗口覆盖层。
 *
 * macOS 使用系统红绿灯，没有 WCO，调用会被跳过。
 *
 * @param window 目标窗口
 * @param theme 当前有效主题
 * @param platform 宿主平台，默认取 `process.platform`
 */
export function applyTitleBarTheme(
  window: TitleBarTarget,
  theme: WindowTheme,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform === 'darwin') return
  window.setTitleBarOverlay({ ...TITLEBAR_THEMES[theme], height: TITLEBAR_HEIGHT })
}
