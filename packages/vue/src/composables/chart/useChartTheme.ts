/**
 * Manages chart theme state (light/dark), computed CSS vars for theming,
 * tooltip up/down colors, and auto theme detection via prefers-color-scheme.
 * Preference lives in settings.theme; effective theme is ctrl.theme (kernel computed).
 */
import { resolveTheme, themeToCssVars } from '@363045841yyt/klinechart-core'
import { type ChartSettings, resolveSettings } from '@363045841yyt/klinechart-core/config'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { Ref } from 'vue'
import { computed, onUnmounted, ref, watch } from 'vue'

import { useControllerSignal } from './useControllerSignal.js'

export function useChartTheme(ctrl: Ref<ChartController | null>, initialTheme?: 'light' | 'dark') {
  /** 镜像 kernel effectiveTheme（shallowRef 避免 deep proxy） */
  const chartTheme = useControllerSignal(
    ctrl,
    (controller) => controller.theme,
    () => initialTheme ?? 'light',
  )
  const chartSettings = ref<ChartSettings>({})

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

  function applyThemeFromSettings(themeSetting: string | undefined) {
    const chartCtrl = ctrl.value
    if (!chartCtrl || !themeSetting) return

    if (themeSetting === 'auto') {
      // 确保偏好为 auto（即使调用方未先 facade）
      chartCtrl.updateSettingsFacade(resolveSettings({ ...chartSettings.value, theme: 'auto' }))
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
      chartCtrl.setTheme(themeSetting as 'light' | 'dark')
    }
  }

  function handleSettingsChange(settings: ChartSettings) {
    chartSettings.value = settings
    const resolved = resolveSettings(settings)
    ctrl.value?.updateSettingsFacade(resolved)
    applyThemeFromSettings(settings.theme as string)
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
    applyThemeFromSettings,
  }
}
