/**
 * Manages chart theme state (light/dark), computed CSS vars for theming,
 * tooltip up/down colors, and auto theme detection via prefers-color-scheme.
 * Handles settings persistence through ChartController.updateSettingsFacade.
 */
import { ref, computed, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import {
  resolveThemeColors,
  themeToCssVars,
  lightTheme,
  darkTheme,
  type ColorPresetSettings,
} from '@363045841yyt/klinechart-core'
import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'

export function useChartTheme(ctrl: Ref<ChartController | null>) {
  const chartTheme = ref<'light' | 'dark'>('light')
  const chartSettings = ref<ChartSettings>({})

  const tooltipColors = computed(() => {
    const isAsiaMarket = chartSettings.value.isAsiaMarket ?? false
    const colors = resolveThemeColors(chartTheme.value, isAsiaMarket as boolean | undefined)
    return {
      upColor: colors.candleUpBody,
      downColor: colors.candleDownBody,
    }
  })

  const themeCssVars = computed(() => {
    const theme = chartTheme.value === 'dark' ? darkTheme : lightTheme
    const overrides = (chartSettings.value.colorPresetSettings as ColorPresetSettings | undefined)?.[
      chartTheme.value
    ]
    if (overrides && Object.keys(overrides).length > 0) {
      return themeToCssVars({ ...theme, colors: { ...theme.colors, ...overrides } })
    }
    return themeToCssVars(theme)
  })

  let autoThemeMediaQuery: MediaQueryList | null = null

  function onSystemThemeChange(e: MediaQueryListEvent) {
    ctrl.value?.setTheme(e.matches ? 'dark' : 'light')
  }

  function applyThemeFromSettings(themeSetting: string | undefined) {
    const chartCtrl = ctrl.value
    if (!chartCtrl || !themeSetting) return

    if (themeSetting === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      chartCtrl.setTheme(mq.matches ? 'dark' : 'light')
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
    applyThemeFromSettings(settings.theme as string)
    ctrl.value?.updateSettingsFacade(settings)
  }

  onUnmounted(() => {
    autoThemeMediaQuery?.removeEventListener('change', onSystemThemeChange)
    autoThemeMediaQuery = null
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
