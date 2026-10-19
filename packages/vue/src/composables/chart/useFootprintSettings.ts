/** 足迹设置草稿：仅编辑与提交足迹参数，取消不写入图表，重置不影响其他设置。 */
import {
  type ChartSettings,
  DEFAULT_SETTINGS,
  isSettingVisible,
  normalizeSettings,
  resolveSettingDefault,
  type SettingItem,
} from '@363045841yyt/klinechart-core/config'
import { computed, ref, watch } from 'vue'

const footprintSettings: readonly SettingItem[] = DEFAULT_SETTINGS.filter(
  (item) => item.group === 'footprint',
)

/** 每次打开从当前图表读取草稿；返回的提交片段只包含足迹设置。 */
export function useFootprintSettings(open: () => boolean, initialSettings: () => ChartSettings) {
  const settings = ref<ChartSettings>({})
  const items = computed(() =>
    footprintSettings.filter((item) => isSettingVisible(item, settings.value)),
  )

  watch(
    open,
    (value) => {
      if (value) settings.value = normalizeSettings(initialSettings())
    },
    { immediate: true },
  )

  /** 只重置足迹参数，保留用于显示条件的当前图表形态。 */
  function reset(): void {
    settings.value = {
      ...settings.value,
      ...Object.fromEntries(
        footprintSettings.map((item) => [item.key, resolveSettingDefault(item.default)]),
      ),
    }
  }

  /** 提交全部足迹参数（包括暂时隐藏的参数），不覆盖其他图表设置。 */
  function snapshot(): ChartSettings {
    return Object.fromEntries(footprintSettings.map((item) => [item.key, settings.value[item.key]]))
  }

  return { settings, items, reset, snapshot }
}
