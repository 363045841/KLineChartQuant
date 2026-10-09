/**
 * 设置对话框的分区与可检索元数据（trading-ui-benchmark §4.2 左侧导航）。
 * 分区只决定展示位置与“恢复默认”的 key 范围；值的读写仍只经过 settingsCommands。
 */
import {
  type ChartSettings,
  DEFAULT_SETTINGS,
  type SettingItem,
} from '@363045841yyt/klinechart-core/config'

export type SettingsSectionId = 'appearance' | 'chart' | 'data' | 'shortcuts' | 'advanced' | 'about'

export interface SettingsSection {
  readonly id: SettingsSectionId
  readonly label: { readonly zh: string; readonly en: string }
  /** 本分区“恢复默认”覆盖的 key；为空表示分区无可恢复设置。 */
  readonly keys: ReadonlyArray<string>
}

const SETTING_ITEMS = DEFAULT_SETTINGS as unknown as ReadonlyArray<SettingItem>

/** 设置项的英文名，供命令面板双语检索。 */
export const SETTING_LABELS_EN: Readonly<Record<string, string>> = {
  displayTimeZone: 'Time zone',
  showGridLines: 'Grid lines',
  showLastPriceCountdown: 'Bar countdown',
  showVolumePriceMarkers: 'Volume-price markers',
  mainRightAxisTypeSetting: 'Right axis type',
  priceAxisPosition: 'Price axis position',
  mainLeftAxisDisplaySetting: 'Left axis',
  mainPriceAxisRangeMode: 'Price scale mode',
  isAsiaMarket: 'Red up / green down',
  rendererBackend: 'Renderer',
  theme: 'Theme mode',
  enableCanvasProfiler: 'Canvas profiler',
  marketDataCacheMaxMiB: 'Market data cache limit',
  tooltipPosition: 'Data tooltip',
  colorPresetSettings: 'Custom colors',
}

/** 图表分区展示的 key（主图 + 价格轴分组；渲染后端在“高级”）。 */
export const CHART_SECTION_KEYS: ReadonlyArray<string> = SETTING_ITEMS.filter(
  (item) => (item.group === 'main' || item.group === 'priceAxis') && item.key !== 'rendererBackend',
).map((item) => item.key)

export const ADVANCED_SECTION_KEYS: ReadonlyArray<string> = [
  'rendererBackend',
  ...SETTING_ITEMS.filter((item) => item.group === 'experimental').map((item) => item.key),
]

export const APPEARANCE_SECTION_KEYS: ReadonlyArray<string> = [
  'theme',
  'colorPresetSettings',
  ...SETTING_ITEMS.filter((item) => item.group === 'style' && item.key !== 'theme').map(
    (item) => item.key,
  ),
]

export const DATA_SECTION_KEYS: ReadonlyArray<string> = ['marketDataCacheMaxMiB']

export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSection> = [
  { id: 'appearance', label: { zh: '外观', en: 'Appearance' }, keys: APPEARANCE_SECTION_KEYS },
  { id: 'chart', label: { zh: '图表', en: 'Chart' }, keys: CHART_SECTION_KEYS },
  { id: 'data', label: { zh: '数据', en: 'Data' }, keys: DATA_SECTION_KEYS },
  { id: 'shortcuts', label: { zh: '快捷键', en: 'Shortcuts' }, keys: [] },
  { id: 'advanced', label: { zh: '高级', en: 'Advanced' }, keys: ADVANCED_SECTION_KEYS },
  { id: 'about', label: { zh: '关于', en: 'About' }, keys: [] },
]

/** 按 key 取设置元数据。 */
export function settingItem(key: string): SettingItem | undefined {
  return SETTING_ITEMS.find((item) => item.key === key)
}

/** 某个 key 所在分区。 */
export function sectionOfSetting(key: string): SettingsSectionId | null {
  return SETTINGS_SECTIONS.find((section) => section.keys.includes(key))?.id ?? null
}

/** 设置值的展示文本（用于命令标题与无障碍名称）。 */
export function settingValueLabel(item: SettingItem, value: ChartSettings[string]): string {
  if (item.type === 'boolean') return value ? '开' : '关'
  return item.options?.find((option) => option.value === String(value))?.label ?? String(value)
}
