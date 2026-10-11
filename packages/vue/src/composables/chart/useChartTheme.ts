/**
 * Manages chart theme state (light/dark), computed CSS vars for theming,
 * tooltip up/down colors, and auto theme detection via prefers-color-scheme.
 * Preference lives in settings.theme; effective theme is ctrl.theme (kernel computed).
 */
import { resolveTheme, themeToCssVars } from '@363045841yyt/klinechart-core'
import { type ChartSettings, normalizeSettings } from '@363045841yyt/klinechart-core/config'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { Ref } from 'vue'
import { computed, onUnmounted, watch } from 'vue'

import { useControllerSignal } from './useControllerSignal.js'

export function useChartTheme(
  ctrl: Ref<ChartController | null>,
  initialTheme?: 'light' | 'dark',
  initialSettings?: ChartSettings,
) {
  /** 直接读取 kernel effectiveTheme，保持 Core 值的引用身份。 */
  const chartTheme = useControllerSignal(
    ctrl,
    (controller) => controller.theme,
    () => initialTheme ?? 'light',
  )
  const chartSettings = useControllerSignal(
    ctrl,
    (controller) => controller.settings,
    () => normalizeSettings(initialSettings),
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

  // 活动布局和设置提交共用内核主题偏好，切换布局时同步系统主题监听。
  function applyThemeFromSettings() {
    const chartCtrl = ctrl.value
    autoThemeMediaQuery?.removeEventListener('change', onSystemThemeChange)
    autoThemeMediaQuery = null
    if (!chartCtrl) return

    if (chartSettings.value.theme === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      chartCtrl.setSystemTheme(mq.matches ? 'dark' : 'light')
      autoThemeMediaQuery = mq
      mq.addEventListener('change', onSystemThemeChange)
    }
  }

  watch([ctrl, () => chartSettings.value.theme], applyThemeFromSettings, { immediate: true })

  // 用户只提交变更，所有主题与配色派生均读取内核设置。
  function handleSettingsChange(settings: ChartSettings) {
    ctrl.value?.updateSettingsFacade(settings)
  }

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
    handleSettingsChange,
  }
}
