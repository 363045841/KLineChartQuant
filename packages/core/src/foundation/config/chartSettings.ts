/**
 * 图表设置配置
 */

export interface SettingItem {
  key: string
  label: string
  type: 'boolean' | 'select' | 'number'
  default: boolean | string | number
  group?: string
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  step?: number
}

/**
 * 检测设备类型：mobile / tablet / desktop
 * 优先使用 Client Hints API (navigator.userAgentData)，不支持时回退到 UA + 屏幕/触控检测
 */
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'desktop'

  const uaData = (navigator as any).userAgentData
  if (uaData?.formFactor) {
    const formFactor = uaData.formFactor as string
    if (formFactor === 'phone') return 'mobile'
    if (formFactor === 'tablet') return 'tablet'
    if (formFactor === 'desktop') return 'desktop'
  }

  if (uaData?.mobile === true) return 'mobile'
  if (uaData?.mobile === false) {
    // 明确非手机，但不确定是平板还是桌面，继续后续判断
  }

  const ua = navigator.userAgent.toLowerCase()
  const isMobileUA =
    /android.*mobile|webos|iphone|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua)
  if (isMobileUA) return 'mobile'

  const hasTouch = navigator.maxTouchPoints > 1
  const isTabletScreen = window.screen.width >= 768 && window.screen.width <= 1366

  if (hasTouch && isTabletScreen) return 'tablet'

  return 'desktop'
}

/** 默认设置配置 */
export const DEFAULT_SETTINGS = [
  { key: 'showGridLines', label: '显示网格', type: 'boolean', default: true, group: 'main' },
  {
    key: 'showVolumePriceMarkers',
    label: '显示量价关系标记',
    type: 'boolean',
    default: false,
    group: 'main',
  },
  {
    key: 'mainRightAxisTypeSetting',
    label: '主图右轴类型',
    type: 'select',
    default: 'linear',
    group: 'main',
    options: [
      { value: 'none', label: '不显示' },
      { value: 'linear', label: '常规轴' },
      { value: 'log', label: '对数轴' },
      { value: 'percent', label: '百分比轴' },
    ],
  },
  {
    key: 'mainLeftAxisDisplaySetting',
    label: '左轴显示',
    type: 'select',
    default: 'none',
    group: 'main',
    options: [
      { value: 'none', label: '不显示' },
      { value: 'price', label: '价格' },
      { value: 'percent', label: '百分比' },
    ],
  },
  {
    key: 'disableMainPaneVerticalScroll',
    label: '主图纵轴刻度自适应调整',
    type: 'boolean',
    default: true,
    group: 'main',
  },
  {
    key: 'isAsiaMarket',
    label: '亚洲市场颜色（红涨绿跌）',
    type: 'boolean',
    default: false,
    group: 'style',
  },
  {
    key: 'rendererBackend',
    label: '渲染后端',
    type: 'select',
    default: 'webgl',
    group: 'main',
    options: [
      { value: 'webgl', label: 'WebGL' },
      { value: 'webgpu', label: 'WebGPU' },
      { value: 'canvas', label: 'Canvas' },
    ],
  },
  {
    key: 'theme',
    label: '主题',
    type: 'select',
    default: 'dark',
    group: 'main',
    options: [
      { value: 'light', label: '浅色' },
      { value: 'dark', label: '深色' },
      { value: 'auto', label: '跟随系统' },
    ],
  },
  {
    key: 'enableCanvasProfiler',
    label: 'Canvas 性能分析插桩',
    type: 'boolean',
    default: false,
    group: 'experimental',
  },
  {
    key: 'marketDataCacheMaxMiB',
    label: '行情缓存上限（MiB）',
    type: 'number',
    default: 50,
min: 5,
    max: 512,
    step: 1,
    group: 'datasource',
  },
  {
    key: 'tooltipPosition',
    label: '数据悬浮框位置',
    type: 'select',
    default: 'adaptive',
    group: 'main',
    options: [
      { value: 'adaptive', label: '自适应右上、左上角' },
      { value: 'crosshair', label: '跟随十字线' },
    ],
  },
] as const

type _SettingTuple = typeof DEFAULT_SETTINGS

type _SettingByKey = {
  [Item in _SettingTuple[number] as Item['key']]: Item['type'] extends 'boolean'
    ? boolean
    : Item['type'] extends 'number'
      ? number
    : Item extends { type: 'select'; options: ReadonlyArray<{ value: infer V }> }
      ? V
      : string
}

/** 图表设置类型（从 DEFAULT_SETTINGS 自动推导，同时兼容扩展） */
export type ChartSettings = {
  [K in keyof _SettingByKey]?: _SettingByKey[K]
} & Record<string, unknown> & {
    colorPresetSettings?: ColorPresetSettings
  }

/** 将 Partial 可选偏好设置与 DEFAULT_SETTINGS 默认值合并，返回全量 ChartSettings
 *
 * @param partial - 偏好的部分设置（通常是组件 prop 传入）
 * @returns 合并后的 ChartSettings 对象
 */
const KNOWN_SETTING_KEYS = new Set<string>([
  ...DEFAULT_SETTINGS.map((item) => item.key),
  'colorPresetSettings',
])

export function resolveSettings(partial?: Partial<ChartSettings>): ChartSettings {
  const source = partial ? migrateStoredSettings(partial as Record<string, unknown>) : undefined
  // 用 Partial<_SettingByKey> 而非 ChartSettings 避免交叉类型索引赋值报错
  const result: Partial<_SettingByKey> = {}
  DEFAULT_SETTINGS.forEach((item) => {
    // 未在 partial 中指定的 key 回退到 DEFAULT_SETTINGS 的默认值
    // 用 ?? 而非 ||，确保显式传入 false / '' 不会被默认值覆盖
    ;(result as Record<string, unknown>)[item.key] = source?.[item.key] ?? item.default
  })
  // colorPresetSettings 不在 DEFAULT_SETTINGS 中，需单独归一化
  ;(result as ChartSettings).colorPresetSettings = normalizeColorPresetSettings(
    source?.colorPresetSettings,
  )
  // 保留扩展字段（如 preClose），避免业务元数据被 resolve 清掉
  if (source) {
    for (const [key, value] of Object.entries(source)) {
      if (KNOWN_SETTING_KEYS.has(key)) continue
      if (value === undefined) continue
      ;(result as Record<string, unknown>)[key] = value
    }
  }
  return result as ChartSettings
}

/** 将旧版持久设置迁移为 rendererBackend 与轴 Setting 字段，返回结果不保留旧字段。 */
export function migrateStoredSettings(stored: Record<string, unknown>): Partial<ChartSettings> {
  const { enableWebGLRendering, rendererBackend, ...rest } = stored
  const validBackend =
    rendererBackend === 'webgpu' || rendererBackend === 'webgl' || rendererBackend === 'canvas'
      ? rendererBackend
      : typeof enableWebGLRendering === 'boolean'
        ? enableWebGLRendering
          ? 'webgl'
          : 'canvas'
        : undefined

  const afterBackend = validBackend ? { ...rest, rendererBackend: validBackend } : rest
  return migrateAxisSettings(afterBackend) as Partial<ChartSettings>
}

/** localStorage 存储键名 */
export const SETTINGS_STORAGE_KEY = 'kline-chart-settings'

/**
 * 从 storage 读取并迁移持久设置；无数据或解析失败时返回 null。
 *
 * @param storage - 可读 Storage；省略时尝试使用全局 localStorage
 */
export function loadStoredSettings(
  storage: Pick<Storage, 'getItem'> | null | undefined = typeof globalThis !== 'undefined' &&
  'localStorage' in globalThis
    ? globalThis.localStorage
    : null,
): Partial<ChartSettings> | null {
  if (!storage) return null
  try {
    const saved = storage.getItem(SETTINGS_STORAGE_KEY)
    if (!saved) return null
    return migrateStoredSettings(JSON.parse(saved) as Record<string, unknown>)
  } catch {
    return null
  }
}

/**
 * 解析运行时设置的权威源。
 *
 * @remarks
 * - 传入 settings prop（含空对象）时：prop 为唯一权威源，未写 key 走 DEFAULT_SETTINGS，
 *   不合并 localStorage 幽灵字段（避免注释掉 prop 字段后仍被持久配置顶回）
 * - 未传 settings prop 时：localStorage + 默认值
 *
 * @param propSettings - 组件 settings prop；undefined 表示未传
 * @param stored - 已读取的持久设置；省略时由 loadStoredSettings 读取
 */
export function resolveRuntimeSettings(
  propSettings?: Partial<ChartSettings>,
  stored?: Partial<ChartSettings> | null,
): ChartSettings {
  if (propSettings !== undefined) {
    return resolveSettings(propSettings)
  }
  return resolveSettings(stored ?? loadStoredSettings() ?? undefined)
}

import {
  type ColorPresetSettings,
  normalizeColorPresetSettings,
} from '../tokens/colorPresetSettings'
import { migrateAxisSettings } from './axisSettings'

export {
  buildPaneScaleTypesFromSetting,
  migrateAxisSettings,
  resolveAxisDisplaySetting,
  resolveEffectiveAxisDisplay,
  resolvePriceScaleTypeSetting,
  resolveRightAxisDisplayFromType,
  resolveRightAxisTypeSetting,
} from './axisSettings'
export type {
  AxisDisplaySetting,
  PriceScaleTypeSetting,
  RightAxisTypeSetting,
} from './axisSettings'
