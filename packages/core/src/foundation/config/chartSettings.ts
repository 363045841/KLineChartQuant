/**
 * 图表设置配置
 */

export interface SettingItem {
  key: string
  label: string
  type: 'boolean' | 'select' | 'number'
  /** 默认值；可为函数以惰性求值（如 rendererBackend 由能力探测提供）。 */
  default: boolean | string | number | (() => boolean | string | number)
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

/** 渲染后端设置值。 */
type RendererBackendSetting = 'webgpu' | 'webgl' | 'canvas'

/**
 * 把能力探测层级映射为 rendererBackend 设置值。
 * webgl2 归一到 webgl；canvas2d 归一到 canvas；none（SSR / 无 DOM）沿用 webgl 默认。
 *
 * @param tier - detectRendererTier 的探测结果
 * @returns rendererBackend 设置值
 */
export function mapRendererTierToBackend(tier: RendererTier): RendererBackendSetting {
  if (tier === 'webgpu') return 'webgpu'
  if (tier === 'canvas2d') return 'canvas'
  return 'webgl'
}

/** 探测结果的进程级缓存，保证 rendererBackend 默认值只探测一次。 */
let cachedRendererBackendDefault: RendererBackendSetting | null = null

/** rendererBackend 默认值：首次调用做一次能力探测并缓存结果。 */
function defaultRendererBackend(): RendererBackendSetting {
  cachedRendererBackendDefault ??= mapRendererTierToBackend(detectRendererTier().tier)
  return cachedRendererBackendDefault
}

/**
 * 解析 SettingItem 的默认值；为函数时调用取返回值。
 *
 * @param value - SettingItem.default
 * @returns 解析后的默认值
 */
export function resolveSettingDefault(value: SettingItem['default']): boolean | string | number {
  return typeof value === 'function' ? value() : value
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
    default: defaultRendererBackend,
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

/** DEFAULT_SETTINGS 已覆盖的 key 及单独归一化的 colorPresetSettings，其余视为扩展字段保留。 */
const KNOWN_SETTING_KEYS = new Set<string>([
  ...DEFAULT_SETTINGS.map((item) => item.key),
  'colorPresetSettings',
])

/**
 * 归一化设置：迁移旧字段、用 DEFAULT_SETTINGS 补齐缺失 key、保留业务扩展字段。
 * 不做分层合并，输入缺什么就回默认值；分层取值由 resolveSettings 负责。
 *
 * @param partial - 设置片段
 * @returns 补齐后的完整 ChartSettings
 */
export function normalizeSettings(partial?: Partial<ChartSettings>): ChartSettings {
  const source = partial ? migrateStoredSettings(partial as Record<string, unknown>) : undefined
  // 用 Partial<_SettingByKey> 而非 ChartSettings 避免交叉类型索引赋值报错
  const result: Partial<_SettingByKey> = {}
  DEFAULT_SETTINGS.forEach((item) => {
    // 未在 partial 中指定的 key 回退到 DEFAULT_SETTINGS 的默认值
    // 用 ?? 而非 ||，确保显式传入 false / '' 不会被默认值覆盖
    ;(result as Record<string, unknown>)[item.key] =
      source?.[item.key] ?? resolveSettingDefault(item.default)
  })
  // colorPresetSettings 不在 DEFAULT_SETTINGS 中，需单独归一化
  ;(result as ChartSettings).colorPresetSettings = normalizeColorPresetSettings(
    source?.colorPresetSettings,
  )
  // 保留扩展字段（如 preClose），避免业务元数据被归一化清掉
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
 * 解析生效设置，逐 key 取值优先级：显式覆盖 > 存量偏好 > DEFAULT_SETTINGS 默认值。
 *
 * @remarks
 * - overrides 为组件 settings prop：仅其显式声明的 key 覆盖存量，未声明的 key 回落到存量。
 * - stored 省略时读取 localStorage 存量；需要纯默认解析（如内核内部状态归一化）时传 {}。
 * - 缺失 key 一律由 DEFAULT_SETTINGS 补齐，返回值始终是完整设置。
 *
 * @param overrides - 显式覆盖项（组件 settings prop）
 * @param stored - 存量偏好；省略时由 loadStoredSettings 读取
 * @returns 分层合并后的完整 ChartSettings
 */
export function resolveSettings(
  overrides?: Partial<ChartSettings> | null,
  stored: Partial<ChartSettings> | null = loadStoredSettings(),
): ChartSettings {
  // 逐 key 合并：overrides 显式声明的 key 覆盖存量，undefined 视为未声明
  const merged: Record<string, unknown> = { ...(stored ?? {}) }
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) continue
      merged[key] = value
    }
  }
  // 迁移、默认值补齐与扩展字段保留统一交给 normalizeSettings
  return normalizeSettings(merged as Partial<ChartSettings>)
}

import {
  type ColorPresetSettings,
  normalizeColorPresetSettings,
} from '../tokens/colorPresetSettings'
import { detectRendererTier, type RendererTier } from '../utils/rendererCapability'

import { migrateAxisSettings } from './axisSettings'

export type {
  AxisDisplaySetting,
  PriceScaleTypeSetting,
  RightAxisTypeSetting,
} from './axisSettings'
export {
  buildPaneScaleTypesFromSetting,
  migrateAxisSettings,
  resolveAxisDisplaySetting,
  resolveEffectiveAxisDisplay,
  resolvePriceScaleTypeSetting,
  resolveRightAxisDisplayFromType,
  resolveRightAxisTypeSetting,
} from './axisSettings'
