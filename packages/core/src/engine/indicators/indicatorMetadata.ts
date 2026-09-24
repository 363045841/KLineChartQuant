/**
 * IndicatorMetadata - 指标元数据定义
 *
 * 支持动态注册指标的核心数据结构
 * 每个指标通过 metadata 描述其渲染器工厂、计算描述与展示配置等元信息
 */

import type {
  IndicatorRenderStateReader,
  RendererPluginWithHost,
} from '../../foundation/plugin/index.js'
import type { ColorTokens } from '../../foundation/tokens/index.js'
import type { KLineData } from '../../foundation/types/price.js'
import type { ChartDataView } from '../state/modeState.js'

import type { IndicatorRenderEntryOf, IndicatorStateName } from './indicatorContracts.js'

/** 单个指标的计算参数。 */
export type IndicatorConfig = Readonly<Record<string, unknown>>

export type IndicatorId = string

/** 指标定义身份：系统渲染器或用户可添加的指标。 */
export const IndicatorKind = Object.freeze({
  System: 'system',
  Indicator: 'indicator',
} as const)

export type IndicatorKind = (typeof IndicatorKind)[keyof typeof IndicatorKind]

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
  /** 渲染器绑定的实例身份；结果与投影都按该 ID 寻址。 */
  instanceId: string
  params?: Record<string, unknown>
}

export interface IndicatorScaleRendererOptions {
  paneId: string
  indicatorId: IndicatorId
  /** 坐标轴绑定的实例身份。 */
  instanceId: string
  axisWidth: number
  yPaddingPx: number
  getCrosshair: () => { y: number; price: number; activePaneId: string | null } | null
}

/**
 * 指标分类：主图/副图
 */
export type IndicatorCategory = 'main' | 'sub' | 'oscillator' | 'volume'

/**
 * 渲染器工厂函数
 */
export type RendererFactory = (options?: IndicatorRendererOptions) => RendererPluginWithHost

/** 解析 renderer plugin 名称所需的稳定上下文，不创建 renderer 实例。 */
export interface IndicatorRendererNameOptions {
  paneId: string
  indicatorId: IndicatorId
}

/** 指标 renderer plugin 名称解析器。 */
export type IndicatorRendererNameResolver = (options: IndicatorRendererNameOptions) => string

/** 指标附属 renderer plugin 名称解析器，不创建 renderer 实例。 */
export type IndicatorAuxiliaryRendererNameResolver = (
  options: IndicatorRendererNameOptions,
) => string | null

export type ScaleRendererFactory = (
  options: IndicatorScaleRendererOptions,
) => RendererPluginWithHost

export interface IndicatorVisibleRange {
  start: number
  end: number
}

export interface IndicatorPriceRange {
  min: number
  max: number
}

/**
 * 单个实例渲染条目读取入口。第二个参数是类型选择键（`IndicatorStateName`），
 * 只用于从渲染状态契约派生条目类型，不参与运行时查找。
 */
export function readIndicatorSeriesEntry<K extends IndicatorStateName>(
  entry: unknown,
  _configKey: K,
): IndicatorRenderEntryOf<K>
/** 读取调用方自行约束结构的条目（泛型 visibleState composer）。 */
export function readIndicatorSeriesEntry<T>(entry: unknown, _configKey: string): T
export function readIndicatorSeriesEntry(entry: unknown, _configKey: string): unknown {
  return entry
}

export type IndicatorPriceRangeComputer = (
  entry: unknown,
  visibleRange: IndicatorVisibleRange,
) => IndicatorPriceRange | null

export type IndicatorRenderStateComposer = (
  entry: unknown,
  visibleRange: IndicatorVisibleRange,
  timestamp: number,
) => unknown

export interface IndicatorVisibleStateComposeContext {
  /** 已规范化的单个实例结果条目，不是类型结果包。 */
  entry: unknown
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
  stateReader: IndicatorRenderStateReader,
  instanceId: string,
  paneId: string,
  colors: ColorTokens,
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
  /** 只影响 calculator 输出的默认参数，不包含 show* 等展示配置。 */
  defaultParams: C
  /** 计算函数（主线程直接调用，Worker 用 computeKey 桥接） */
  compute: (data: KLineData[], config: C) => unknown
  /** Worker 端计算键名，映射到 calculators 模块的导出 */
  computeKey: string
  /** calculator 输出是否按 K 线下标对齐，默认 bar。 */
  outputAlignment?: 'bar' | 'aggregate'
}

/** 指标展示配置，不进入 Runtime、Worker 或业务结果池。 */
export interface IndicatorPresentationDescriptor<O = Readonly<Record<string, unknown>>> {
  readonly defaultOptions: O
  /** 从完整计算结果中选择当前需要投影的字段，计算结果本身保持不变。 */
  readonly selectSeriesKeys?: (
    params: Readonly<Record<string, unknown>>,
    options: O,
  ) => ReadonlyArray<string>
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

  /** 定义身份：系统渲染器或用户可添加的指标。 */
  kind: IndicatorKind

  /**
   * 分类：主图/副图
   */
  category: IndicatorCategory

  /** 用于指标选择器分组的业务类型。 */
  indicatorType: IndicatorType

  /** 扩展类型的显示名称；内置类型可省略。 */
  indicatorTypeLabel?: string

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

  /** 指标可参与渲染的数据视图；未声明时仅支持 K 线。 */
  dataViews?: readonly ChartDataView[]

  /**
   * 是否启用（可选条件判断）
   * 用于副图指标根据配置决定是否参与计算
   */
  isEnabled?: (config: IndicatorConfig) => boolean

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

  /** 不创建 renderer 实例地解析其 plugin 名称。 */
  getRendererName: IndicatorRendererNameResolver

  /** 不创建 renderer 实例地解析副图坐标轴 plugin 名称；无坐标轴时返回 null。 */
  getScaleRendererName: IndicatorAuxiliaryRendererNameResolver

  /** 不创建 renderer 实例地解析副图标题 plugin 名称；无标题时返回 null。 */
  getPaneTitleRendererName: IndicatorAuxiliaryRendererNameResolver

  visibleState?: {
    compose: IndicatorVisibleStateComposer
  }

  /**
   * 计算描述符（可选）
   * 提供后，IndicatorRuntime 可据此自动调度计算，无需手写展开
   */
  runtime?: IndicatorRuntimeDescriptor

  /** renderer 投影使用的展示配置。 */
  presentation?: IndicatorPresentationDescriptor

  /**
   * 标题信息获取回调（决定 pane 标题栏显示内容）
   * - 副图指标：由 paneTitle 渲染器调用
   * - 主图指标：由 mainIndicatorLegend 渲染器调用
   * 未提供时 fallback 到 displayName
   */
  getTitleInfo?: GetTitleInfoFn
}
