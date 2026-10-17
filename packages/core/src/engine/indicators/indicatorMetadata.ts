/**
 * IndicatorMetadata - 指标元数据定义
 *
 * 支持动态注册指标的核心数据结构
 * 每个指标通过 metadata 描述其渲染器工厂、计算描述与展示配置等元信息
 */

import type {
  IndicatorSource,
  IndicatorSourceDocument,
} from '@363045841yyt/klinechart-plot-contracts'
import type { IndicatorRenderStateReader, RenderContext } from '../../foundation/plugin/index.js'
import type { ColorTokens } from '../../foundation/tokens/index.js'
import type { KLineData } from '../../foundation/types/price.js'
import type { Layer } from '../../rendering/scene/types.js'
import type { ChartDataView } from '../chartModel/index.js'
import type { IndicatorPlotDefinition } from '../plots/types.js'
import type { IndicatorRenderEntryOf, IndicatorStateName } from './indicatorContracts.js'

/** 单个指标的计算参数。 */
export type IndicatorConfig = Readonly<Record<string, unknown>>

export type IndicatorId = string
/** 指标定义来源，与均线、动量等业务分类独立；由定义契约统一给出。 */
export type { IndicatorSource }

/** 指标定义身份：系统渲染器或用户可添加的指标。 */
export const IndicatorKind = Object.freeze({
  System: 'system',
  Indicator: 'indicator',
} as const)

export type IndicatorKind = (typeof IndicatorKind)[keyof typeof IndicatorKind]

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
export type RendererFactory = (options: IndicatorRendererOptions) => Layer<RenderContext>

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

export type ScaleRendererFactory = (options: IndicatorScaleRendererOptions) => Layer<RenderContext>

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
/** 读取调用方自行约束结构的领域输出条目。 */
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

/** 领域输出的专用投影和价格范围；普通数值序列使用 Plot。 */
export interface IndicatorCustomStateDescriptor {
  compose: IndicatorRenderStateComposer
  computePriceRange?: IndicatorPriceRangeComputer
}

/**
 * 标题值项：颜色 + 数值 + 标签
 */
export interface TitleValueItem {
  label: string
  value: number
  /** 指标专用的数值展示文本；未指定时按通用精度展示。 */
  formattedValue?: string
  color: string
}

/**
 * 标题信息：指标名称 + 参数 + 各线实时值
 */
export interface TitleInfo {
  name: string
  /** 参数文本片段；数字参数与枚举参数统一按顺序拼接展示。 */
  params?: (number | string)[]
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
 * 输入参数在面板中的展示声明。
 *
 * 只承载展示信息，默认值与类型仍由 runtime.defaultParams 提供，避免两处各存一份默认值。
 */
export interface IndicatorInputDef {
  readonly min?: number
  readonly max?: number
  readonly step?: number
  /** 面板显示名；缺省显示参数名。 */
  readonly title?: string
  /** 下拉选项；仅字符串输入可声明，面板据此渲染选择菜单。 */
  readonly options?: readonly string[]
}

/**
 * 指标计算描述符
 * 描述每个指标的计算逻辑，供 IndicatorRuntime 驱动
 *
 * - 主线程：直接调用 compute
 * - Worker：用 computeKey 从 calculators 模块映射到实际函数
 * - 自定义运行时指标：无 computeKey，仅主线程 inline 运行
 */
export interface IndicatorRuntimeDescriptor<C = any> {
  /** 定义版本属于计算身份，源码更新不依赖行情或参数变化。 */
  revision?: number
  /** 声明额外行情输入；订阅由数据协调层拥有。 */
  inputs?: readonly 'trades'[]
  /** 每个执行器创建独立的增量 calculator。 */
  createCompute?: () => (
    data: KLineData[],
    config: C,
    trades?: import('../../data/trades/types.js').TradeSnapshot,
  ) => unknown
  /** configSnapshot 中的 key，默认等于 name（如 'macd'） */
  configKey?: string
  /** paneId 在 configSnapshot 中的 key（如 'macdPaneId'），可省略 */
  paneIdKey?: string
  /** 只影响 calculator 输出的默认参数，不包含 show* 等展示配置。 */
  defaultParams: C
  /** 参数展示声明，按参数名索引；缺省时面板用参数名当标题。 */
  inputDefs?: Readonly<Record<string, IndicatorInputDef>>
  /** 计算函数（主线程直接调用，Worker 用 computeKey 桥接） */
  compute: (
    data: KLineData[],
    config: C,
    trades?: import('../../data/trades/types.js').TradeSnapshot,
    market?: import('@363045841yyt/klinechart-plot-contracts').IndicatorMarketContext,
  ) => unknown
  /** Worker 端计算键名，映射到 calculators 模块的导出 */
  computeKey?: string
  /** calculator 输出是否按 K 线下标对齐，默认 bar。 */
  outputAlignment?: 'bar' | 'aggregate'
}

/** 指标展示配置，不进入 Runtime、Worker 或业务结果池。 */
export interface IndicatorPresentationDescriptor<O = Readonly<Record<string, unknown>>> {
  readonly defaultOptions: O
}

/**
 * 指标元数据接口
 */
export interface IndicatorMetadata<T = unknown> {
  source?: IndicatorSource
  document?: IndicatorSourceDocument
  /** 普通指标统一声明 Plot；专用输出使用自己的 composer。 */
  plots?: IndicatorPlotDefinition
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
    toActiveConfig?: (
      params: Record<string, unknown>,
      active: boolean,
    ) => Record<string, unknown> | null
  }

  /** 不创建 renderer 实例地解析其 plugin 名称。 */
  getRendererName: IndicatorRendererNameResolver

  /** 不创建 renderer 实例地解析副图坐标轴 plugin 名称；无坐标轴时返回 null。 */
  getScaleRendererName: IndicatorAuxiliaryRendererNameResolver

  customState?: IndicatorCustomStateDescriptor

  /**
   * 计算描述符（可选）
   * 提供后，IndicatorRuntime 可据此自动调度计算，无需手写展开
   */
  runtime?: IndicatorRuntimeDescriptor

  /** renderer 投影使用的展示配置。 */
  presentation?: IndicatorPresentationDescriptor

  /**
   * 标题信息获取回调（决定 pane 标题栏显示内容）
   * 主副图统一由图例管理器调用。
   */
  getTitleInfo?: GetTitleInfoFn
}
