/** 主题状态模块：系统主题注入点与主题偏好。 */
import { createSubState } from '../../foundation/reactivity/signal'

/**
 * 系统主题（OS / matchMedia）注入点。
 * 用户偏好在 settings.theme（含 auto）；生效主题由 kernel effectiveTheme computed 推导。
 */
export function createSystemThemeState() {
  const { signals, readonly } = createSubState({
    systemTheme: 'light' as 'light' | 'dark',
  })

  return {
    readonly,
    actions: {
      setSystemTheme(theme: 'light' | 'dark') {
        if (signals.systemTheme.peek() === theme) return
        signals.systemTheme.set(theme)
      },
    },
    dispose() {
      signals.systemTheme.set('light')
    },
  }
}

export type SystemThemeStateModule = ReturnType<typeof createSystemThemeState>

/** @deprecated 使用 createSystemThemeState；偏好主题在 settingsState */
export const createThemeState = createSystemThemeState
export type ThemeStateModule = SystemThemeStateModule
