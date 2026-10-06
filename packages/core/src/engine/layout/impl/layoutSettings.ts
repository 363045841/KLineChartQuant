// 图表级设置白名单：应用和设备偏好不随布局保存或恢复。
import { type ChartSettings, DEFAULT_SETTINGS } from '../../../foundation/config/chartSettings.js'

/** 只复制已声明的图表设置和颜色预设，排除扩展业务字段。 */
export function selectLayoutSettings(settings: Partial<ChartSettings>): Partial<ChartSettings> {
  const entries = DEFAULT_SETTINGS.filter(
    ({ key }) =>
      key !== 'rendererBackend' &&
      key !== 'marketDataCacheMaxMiB' &&
      key !== 'enableCanvasProfiler',
  )
    .filter(({ key }) => settings[key] !== undefined)
    .map(({ key }) => [key, settings[key]])
  return {
    ...Object.fromEntries(entries),
    ...(settings.colorPresetSettings === undefined
      ? {}
      : { colorPresetSettings: settings.colorPresetSettings }),
  }
}
