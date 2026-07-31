/**
 * IndicatorMetadata - 指标元数据定义
 *
 * 支持动态注册指标的核心数据结构
 * 每个指标通过 metadata 描述其状态 key、渲染器工厂等元信息
 */

import { KLineChartError } from '../../errors'
import type { PluginHost, RendererPluginWithHost } from '../../foundation/plugin/index'
import type { KLineData } from '../../foundation/types/price'

import type { IndicatorConfigSnapshot, IndicatorSeriesBundle } from './workerProtocol'

export type IndicatorId = string

/**
 * 可扩展的指标业务类型注册表，第三方可通过 TypeScript declaration merging 增加类型。
 */
export interface IndicatorTypeRegistry {
  'moving-average': unknown
  trend: unknown
  momentum: unknown
  volatility: unknown
  channel: unknown
  volume: unknown
  'support-resistance': unknown
  structure: unknown
  other: unknown
}

/** 指标业务类型 ID。 */
export type IndicatorType = keyof IndicatorTypeRegistry

/** 内置指标类型定义，同时作为 UI 的默认名称与排序来源。 */
export const BUILTIN_INDICATOR_TYPES = [
  { id: 'moving-average', label: '均线类', order: 10 },
  { id: 'trend', label: '趋势类', order: 20 },
  { id: 'momentum', label: '动量类', order: 30 },
  { id: 'volatility', label: '波动率类', order: 40 },
  { id: 'channel', label: '通道类', order: 50 },
  { id: 'volume', label: '成交量类', order: 60 },
  { id: 'support-resistance', label: '支撑阻力类', order: 70 },
  { id: 'structure', label: '市场结构类', order: 80 },
  { id: 'other', label: '其他', order: 999 },
] as const satisfies ReadonlyArray<{ id: IndicatorType; label: string; order: number }>

/** 返回内置类型名称，扩展类型使用注册时声明的名称。 */
export function getBuiltinIndicatorTypeLabel(type: IndicatorType): string | undefined {
  return BUILTIN_INDICATOR_TYPES.find((item) => item.id === type)?.label
}

/** 返回内置类型排序，扩展类型默认排列在内置类型之后。 */
export function getBuiltinIndicatorTypeOrder(type: IndicatorType): number {
  return BUILTIN_INDICATOR_TYPES.find((item) => item.id === type)?.order ?? 900
}

export interface IndicatorRendererOptions {
  paneId: string
  indicatorId: IndicatorId
  params?: Record<string, unknown>
}

export interface IndicatorScaleRendererOptions {
  paneId: string
  indicatorId: IndicatorId
  axisWidth: number
  yPaddingPx: number
  getCrosshair: () => { y: number; price: number; activePaneId: string | null } | null
}

/**
 * 指标分类：主图/副图
 */
export type IndicatorCategory = 'main' | 'sub' | 'oscillator' | 'volume'

/**
 * State key 生成器类型
 * - 主图指标：常量字符串
 * - 副图指标：函数，接收 paneId 返回 key
 */
export type StateKey = string | ((paneId: string) => string)

/**
 * 渲染器工厂函数
 */
export type RendererFactory = (options?: IndicatorRendererOptions) => RendererPluginWithHost

export type ScaleRendererFactory = (
  options: IndicatorScaleRendererOptions,
) => RendererPluginWithHost

export type IndicatorConfigUpdater = (
  scheduler: unknown,
  params: Record<string, unknown>,
  paneId: string,
) => void

export interface IndicatorSemanticChartAdapter {
  updateRendererConfig(name: string, config: Record<string, unknown>): void
}

export interface IndicatorVisibleRange {
  start: number
  end: number
}

export interface IndicatorPriceRange {
  min: number
  max: number
}

export type IndicatorPriceRangeComputer = (
  bundle: IndicatorSeriesBundle,
  visibleRange: IndicatorVisibleRange,
) => IndicatorPriceRange | null

export type IndicatorRenderStateComposer = (
  bundle: IndicatorSeriesBundle,
  visibleRange: IndicatorVisibleRange,
  timestamp: number,
) => unknown

export interface IndicatorVisibleStateComposeContext {
  bundle: IndicatorSeriesBundle
  visibleRange: IndicatorVisibleRange
  timestamp: number
  active: boolean
}

export type IndicatorVisibleStateComposer = (
  context: IndicatorVisibleStateComposeContext,
) => unknown

/**
 * 标题值项：颜色 + 数值 + 标签
 */
export interface TitleValueItem {
  label: string
  value: number
  color: string
}

/**
 * 标题信息：指标名称 + 参数 + 各线实时值
 */
export interface TitleInfo {
  name: string
  params?: number[]
  values?: TitleValueItem[]
}

/**
 * 获取标题信息的回调类型
 */
export type GetTitleInfoFn = (
  data: KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  host: PluginHost,
  paneId: string,
) => TitleInfo | null

/**
 * 指标计算描述符
 * 描述每个指标的计算逻辑，供 IndicatorRuntime 驱动
 *
 * - 主线程：直接调用 compute
 * - Worker：用 computeKey 从 calculators 模块映射到实际函数
 * - 自定义运行时指标：无 computeKey，仅主线程 inline 运行
 */
export interface IndicatorRuntimeDescriptor<C = any> {
  /** configSnapshot 中的 key，默认等于 name（如 'macd'） */
  configKey?: string
  /** paneId 在 configSnapshot 中的 key（如 'macdPaneId'），可省略 */
  paneIdKey?: string
  /** 默认配置值 */
  defaultConfig: C
  /** 计算函数（主线程直接调用，Worker 用 computeKey 桥接） */
  compute: (data: KLineData[], config: C) => unknown
  /** Worker 端计算键名，映射到 calculators 模块的导出 */
  computeKey: string
}

/**
 * 指标元数据接口
 */
export interface IndicatorMetadata<T = unknown> {
  /**
   * 指标唯一标识
   * 如：'ma', 'boll', 'rsi', 'customIndicator'
   */
  name: string

  /**
   * 可选别名，用于兼容 UI/API 中的大写 ID 或历史名称。
   */
  aliases?: readonly string[]

  /**
   * 显示名称（用于日志和调试）
   */
  displayName: string

  /**
   * 分类：主图/副图
   */
  category: IndicatorCategory

  /** 用于指标选择器分组的业务类型。 */
  indicatorType: IndicatorType

  /** 扩展类型的显示名称；内置类型可省略。 */
  indicatorTypeLabel?: string

  /**
   * StateStore key
   * - 主图指标：常量字符串（如 'indicator:ma:main'）
   * - 副图指标：函数 (paneId) => string
   */
  stateKey: StateKey

  /**
   * 在 configSnapshot 中的 paneId 字段名
   * 用于从配置中获取当前 pane ID
   */
  paneIdField?: string

  /**
   * 渲染器工厂函数
   * 调用时创建该指标的渲染器实例
   */
  rendererFactory: RendererFactory

  /**
   * 专用坐标轴渲染器工厂。未提供时可回退到 scale 通用配置。
   */
  scaleRendererFactory?: ScaleRendererFactory

  /**
   * 通用指标坐标轴配置。
   */
  scale?: {
    indicatorKey?: string
    label?: string
    decimals?: number
  }

  /**
   * 默认 pane ID
   * - 主图指标：'main'
   * - 副图指标：如 'sub_RSI'
   */
  defaultPaneId: string

  /**
   * 是否启用（可选条件判断）
   * 用于副图指标根据配置决定是否参与计算
   */
  isEnabled?: (config: IndicatorConfigSnapshot) => boolean

  /**
   * 指标配置更新入口。内置和用户自定义指标都应通过 metadata 分发。
   */
  updateConfig?: IndicatorConfigUpdater

  /**
   * 将指标计算结果写入 StateStore
   * @param host - PluginHost
   * @param state - 计算结果（由 composeRenderStates 或 composeVisibleSubIndicatorStates 产出）
   * @param paneId - 目标 pane ID（从 configSnapshot 读取）
   */
  applyResult?: (host: PluginHost, state: unknown, paneId: string) => void

  /**
   * 是否允许在主图显示（部分副图指标可切换至主图）
   * - true：指标可放置在主图（如 WMA/SAR/Pivot 等叠加类指标）
   * - false/undefined：仅限副图显示
   */
  allowMainPane?: boolean

  /**
   * 主图指标启停相关配置。
   */
  mainPane?: {
    rendererName: string
    toActiveConfig?: (
      params: Record<string, unknown>,
      active: boolean,
    ) => Record<string, unknown> | null
    computePriceRange?: IndicatorPriceRangeComputer
    composeRenderState?: IndicatorRenderStateComposer
  }

  visibleState?: {
    compose: IndicatorVisibleStateComposer
  }

  /**
   * 计算描述符（可选）
   * 提供后，IndicatorRuntime 可据此自动调度计算，无需手写展开
   */
  runtime?: IndicatorRuntimeDescriptor

  /**
   * 语义配置应用入口。
   */
  semantic?: {
    apply?: (chart: IndicatorSemanticChartAdapter, indicator: T) => void
  }

  /**
   * 标题信息获取回调（决定 pane 标题栏显示内容）
   * - 副图指标：由 paneTitle 渲染器调用
   * - 主图指标：由 mainIndicatorLegend 渲染器调用
   * 未提供时 fallback 到 displayName
   */
  getTitleInfo?: GetTitleInfoFn
}

/**
 * 提取 stateKey 对应的实际 key 值
 * @param stateKey - 可以是字符串或函数
 * @param paneId - pane ID（副图指标需要）
 * @returns 实际的 state key 字符串
 */
export function resolveStateKey(stateKey: StateKey, paneId?: string): string {
  if (typeof stateKey === 'function') {
    if (!paneId) {
      throw new KLineChartError(
        'INVALID_PARAM',
        '[IndicatorMetadata] Pane ID required for dynamic state key',
      )
    }
    return stateKey(paneId)
  }
  return stateKey
}
