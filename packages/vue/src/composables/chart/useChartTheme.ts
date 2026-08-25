/**
 * Manages chart theme state (light/dark), computed CSS vars for theming,
 * tooltip up/down colors, and auto theme detection via prefers-color-scheme.
 * Preference lives in settings.theme; effective theme is ctrl.theme (kernel computed).
 */
import {
  resolveThemeColors,
  themeToCssVars,
  lightTheme,
  darkTheme,
  type ColorPresetSettings,
} from '@363045841yyt/klinechart-core'
import { resolveSettings, type ChartSettings } from '@363045841yyt/klinechart-core/config'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { Ref } from 'vue'
import { ref, shallowRef, computed, watch, onUnmounted } from 'vue'

export function useChartTheme(ctrl: Ref<ChartController | null>, initialTheme?: 'light' | 'dark') {
  /** 镜像 kernel effectiveTheme（shallowRef 避免 deep proxy） */
  const chartTheme = shallowRef<'light' | 'dark'>(initialTheme ?? 'light')
  const chartSettings = ref<ChartSettings>({})

  let unsubTheme: (() => void) | null = null

  function syncThemeFromController() {
    const c = ctrl.value
    if (!c) return
    chartTheme.value = c.theme.peek()
  }

  watch(
    ctrl,
    (c) => {
      unsubTheme?.()
      unsubTheme = null
      if (!c) return
      syncThemeFromController()
      unsubTheme = c.theme.subscribe(() => {
        chartTheme.value = c.theme.peek()
      })
    },
    { immediate: true },
  )

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
    const colors = resolveThemeColors(
      chartTheme.value,
      chartSettings.value.isAsiaMarket as boolean | undefined,
      chartSettings.value.colorPresetSettings as ColorPresetSettings | undefined,
    )
    return themeToCssVars({ ...theme, colors })
  })

  watch(
    themeCssVars,
    (vars) => {
      for (const [name, value] of Object.entries(vars)) {
        document.body.style.setProperty(name, value)
      }
      document.body.style.backgroundColor = vars['--klc-color-background'] ?? ''
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
    unsubTheme?.()
    unsubTheme = null
    autoThemeMediaQuery?.removeEventListener('change', onSystemThemeChange)
    autoThemeMediaQuery = null
    for (const name of Object.keys(themeCssVars.value)) {
      document.body.style.removeProperty(name)
    }
    document.body.style.backgroundColor = ''
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
