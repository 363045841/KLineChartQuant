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

/** 单个指标的计算参数。 */
export type IndicatorConfig = Readonly<Record<string, unknown>>

export type IndicatorId = string
/** 指标定义来源，与均线、动量等业务分类独立；由定义契约统一给出。 */
export type { IndicatorSource }

export interface IndicatorRendererOptions {
  paneId: string
  indicatorId: IndicatorId
  /** 渲染器绑定的实例身份；结果与投影都按该 ID 寻址。 */
  instanceId: string
  /** 框架派生的轴身份；渲染器据此把值映射到自己的轴。 */
  axisId: string
  params?: Record<string, unknown>
}

export interface IndicatorScaleRendererOptions {
  paneId: string
  indicatorId: IndicatorId
  /** 框架派生的轴身份；一个轴只创建一个刻度层。 */
  axisId: string
  axisWidth: number
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
  /** 实例身份；多实例图层命名必须包含它。 */
  instanceId?: string
}

/** 指标值轴类型：价格类与值类决定能否共享轴。 */
export type IndicatorAxisKind = 'price' | 'value'

/** 定义默认轴绑定：共享 Pane 内同类轴，或为实例创建独立轴。 */
export type IndicatorAxisBinding = 'shared' | 'own'

/** 指标 renderer plugin 名称解析器。 */
export type IndicatorRendererNameResolver = (options: IndicatorRendererNameOptions) => string

/** 指标附属 renderer plugin 名称解析器，不创建 renderer 实例。 */
export type IndicatorAuxiliaryRendererNameResolver = (
  options: IndicatorRendererNameOptions,
) => string | null

export type ScaleRendererFactory = (options: IndicatorScaleRendererOptions) => Layer<RenderContext>

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
  data: readonly KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  instanceId: string,
  paneId: string,
  colors: ColorTokens,
) => TitleInfo | null

/** 下拉选项：值即参数取值，label 为面板显示名。 */
export type IndicatorInputOption = import('@363045841yyt/klinechart-plot-contracts').InputOption

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
  readonly options?: readonly (string | IndicatorInputOption)[]
}

/**
 * 指标计算描述符
 * 描述指标的计算端口；Script 定义将计算委派给 Script 服务管理的 Worker。
 */
export interface IndicatorRuntimeDescriptor<C = any> {
  /** 定义版本属于计算身份，源码更新不依赖行情或参数变化。 */
  revision?: number
  /** 计算对历史的依赖；缺省按有状态处理，正确性优先。 */
  dependency?: import('@363045841yyt/klinechart-plot-contracts').ComputeDependency
  /** 每个执行器创建独立的增量 calculator。 */
  createCompute?: () => ((
    data: readonly KLineData[],
    config: C,
    market?: import('@363045841yyt/klinechart-plot-contracts').IndicatorMarketContext,
    range?: import('@363045841yyt/klinechart-plot-contracts').ComputeRange,
  ) => unknown) & { dispose?(): void }
  /** 只影响 calculator 输出的默认参数，不包含 show* 等展示配置。 */
  defaultParams: C
  /** 参数展示声明，按参数名索引；缺省时面板用参数名当标题。 */
  inputDefs?: Readonly<Record<string, IndicatorInputDef>>
  /** 注册定义的唯一计算端口。 */
  compute: (
    data: readonly KLineData[],
    config: C,
    market?: import('@363045841yyt/klinechart-plot-contracts').IndicatorMarketContext,
    range?: import('@363045841yyt/klinechart-plot-contracts').ComputeRange,
  ) => unknown
  /** calculator 输出是否按 K 线下标对齐，默认 bar。 */
  outputAlignment?: 'bar' | 'aggregate'
}

/** 指标展示配置，不进入 Runtime、Worker 或业务结果池。 */
export interface IndicatorPresentationDescriptor<O = Readonly<Record<string, unknown>>> {
  readonly defaultOptions: O
}

/** 可见范围使用的周期单位；同单位内用 min/max 表示区间。 */
export type IndicatorPeriodUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter'

/** 一条可见范围声明；省略 min/max 表示该单位全段可见。 */
export interface IndicatorPeriodVisibility {
  readonly unit: IndicatorPeriodUnit
  readonly min?: number
  readonly max?: number
}

/**
 * 指标元数据接口
 */
export interface IndicatorMetadata<_T = unknown> {
  source?: IndicatorSource
  document?: IndicatorSourceDocument
  /** 序列和绘图对象统一声明公共 Plot 输出。 */
  plots?: IndicatorPlotDefinition
  /**
   * 指标唯一标识
   * 如：'ma', 'boll', 'rsi', 'customIndicator'
   */
  name: string

  /** 指标选择器/图例显示的长名称；缺省用 displayName。 */
  readonly title?: string

  /** 指标选择器里的说明文本；缺省不展示说明。 */
  readonly info?: string

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

  /** 值轴类型；缺省按分类推导（主图价格、其余值）。 */
  readonly axisKind?: IndicatorAxisKind

  /** 默认轴绑定；缺省主图共享、其余独立。 */
  readonly defaultAxis?: IndicatorAxisBinding

  /** 是否允许同一张图存在多份实例；缺省允许。 */
  readonly multiInstance?: boolean

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

  /** 指标选择器 UI 元数据：内置指标来自静态 uiMeta 表；外部指标随定义携带。 */
  ui?: { name?: string; description?: string; params?: readonly unknown[] }

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
   * 指标在哪些图表周期可见；未声明时所有周期都可见。
   * 声明后，不在范围内的周期既不绘制也不出现在图例里（TradingView 的「可见范围」）。
   */
  visiblePeriods?: readonly IndicatorPeriodVisibility[]

  /** 不创建 renderer 实例地解析其 plugin 名称。 */
  getRendererName: IndicatorRendererNameResolver

  /** 不创建 renderer 实例地解析副图坐标轴 plugin 名称；无坐标轴时返回 null。 */
  getScaleRendererName: IndicatorAuxiliaryRendererNameResolver

  /**
   * 计算描述符（可选）
   * 提供后，实例计算链路据此调度计算，无需手写展开
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
