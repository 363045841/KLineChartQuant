import { createSubState } from '../../foundation/reactivity/signal'

export function createThemeState() {
  const { signals, readonly } = createSubState({
    theme: 'light' as 'light' | 'dark',
  })

  return {
    readonly,
    signals,

    actions: {
      setTheme(theme: 'light' | 'dark') {
        signals.theme.set(theme)
      },
    },

    dispose() {
      signals.theme.set('light')
    },
  }
}

export type ThemeStateModule = ReturnType<typeof createThemeState>