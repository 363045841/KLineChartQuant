/**
 * Manages chart theme state (light/dark), computed CSS vars for theming,
 * tooltip up/down colors, and auto theme detection via prefers-color-scheme.
 * Preference lives in settings.theme; effective theme is ctrl.theme (kernel computed).
 *
 * Settings are read from the kernel signal only (ADR 0006): whoever writes them —
 * the settings dialog, the command palette or an Agent tool — the theme follows.
 */
import { resolveTheme, themeToCssVars } from '@363045841yyt/klinechart-core'
import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { Ref } from 'vue'
import { computed, onUnmounted, watch } from 'vue'

import { useControllerSignal, useControllerSignalValue } from './useControllerSignal.js'

export function useChartTheme(
  ctrl: Ref<ChartController | null>,
  initialTheme?: 'light' | 'dark',
  initialSettings: () => ChartSettings = () => ({}),
) {
  /** 镜像 kernel effectiveTheme（shallowRef 避免 deep proxy） */
  const chartTheme = useControllerSignal(
    ctrl,
    (controller) => controller.theme,
    () => initialTheme ?? 'light',
  )
  /** kernel.settings 的只读投影；controller 就绪前使用分层解析的初始快照。 */
  const chartSettings = useControllerSignal(
    ctrl,
    (controller) => controller.settings,
    initialSettings,
  )

  const resolvedTheme = computed(() =>
    resolveTheme(
      chartTheme.value,
      chartSettings.value.isAsiaMarket,
      chartSettings.value.colorPresetSettings,
    ),
  )

  const tooltipColors = computed(() => {
    const colors = resolvedTheme.value.colors
    return {
      upColor: colors.candleUpBody,
      downColor: colors.candleDownBody,
    }
  })

  const themeCssVars = computed(() => themeToCssVars(resolvedTheme.value))

  watch(
    themeCssVars,
    (vars) => {
      for (const [name, value] of Object.entries(vars)) {
        document.body.style.setProperty(name, value)
      }
      document.body.style.backgroundColor = vars['--klc-color-background'] ?? ''
      document.documentElement.style.colorScheme = chartTheme.value
    },
    { immediate: true },
  )

  let autoThemeMediaQuery: MediaQueryList | null = null

  function onSystemThemeChange(e: MediaQueryListEvent) {
    ctrl.value?.setSystemTheme(e.matches ? 'dark' : 'light')
  }

  /** settings.theme 为 auto 时跟随系统；否则停止监听。生效主题由 kernel 推导。 */
  function applyThemeFromSettings(themeSetting: string | undefined) {
    const chartCtrl = ctrl.value
    if (!chartCtrl || !themeSetting) return
    if (themeSetting === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      chartCtrl.setSystemTheme(mq.matches ? 'dark' : 'light')
      if (autoThemeMediaQuery !== mq) {
        autoThemeMediaQuery?.removeEventListener('change', onSystemThemeChange)
        autoThemeMediaQuery = mq
        mq.addEventListener('change', onSystemThemeChange)
      }
    } else {
      autoThemeMediaQuery?.removeEventListener('change', onSystemThemeChange)
      autoThemeMediaQuery = null
    }
  }

  // 任一来源写入 settings.theme 都会经过这里。
  const themePreference = useControllerSignalValue(
    ctrl,
    (controller) => controller.settings,
    (settings) => settings.theme as string | undefined,
    () => undefined,
  )
  watch([themePreference, ctrl], ([theme]) => applyThemeFromSettings(theme), { immediate: true })

  onUnmounted(() => {
    autoThemeMediaQuery?.removeEventListener('change', onSystemThemeChange)
    autoThemeMediaQuery = null
    // body 上的主题变量是页面级共享资源，所有图表实例解析结果一致。单个实例卸载时不清空，
    // 由下一次挂载的 setProperty 覆盖，避免误删仍在使用的实例主题。
  })

  return {
    chartTheme,
    chartSettings,
    tooltipColors,
    themeCssVars,
    applyThemeFromSettings,
  }
}
