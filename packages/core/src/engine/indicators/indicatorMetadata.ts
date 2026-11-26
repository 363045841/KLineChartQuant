/**
 * IndicatorMetadata - 指标元数据定义
 *
 * 支持动态注册指标的核心数据结构
 * 每个指标通过 metadata 描述其渲染器工厂、计算描述与展示配置等元信息
 */

import type {
  IndicatorSource,
  IndicatorSourceDocument,
  ScriptDefinitionKind,
} from '@363045841yyt/klinechart-plot-contracts'
import type { IndicatorRenderStateReader, RenderContext } from '../../foundation/plugin/index.js'
import type { ColorTokens } from '../../foundation/tokens/index.js'
import type { KLineData } from '../../foundation/types/price.js'
import type { Layer } from '../../rendering/scene/types.js'
import type { ChartDataView } from '../chartModel/index.js'
import type { IndicatorPlotDefinition } from '../plots/types.js'
import type { CalculationCompute } from '../calculation/types.js'

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
  /** 框架分配的稳定 Layer ID；渲染器不得自行推导。 */
  layerId: string
  params?: Record<string, unknown>
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

/** 指标 renderer plugin 名称解析器。 */
export type IndicatorRendererNameResolver = (options: IndicatorRendererNameOptions) => string

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
 * 只承载展示信息，默认值与类型仍由 runtime.defaultInputs 提供，避免两处各存一份默认值。
 */
export interface IndicatorInputDisplay {
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
export interface IndicatorRuntimeDescriptor {
  /** 定义版本属于计算身份，源码更新不依赖行情或参数变化。 */
  revision?: number
  /** 计算对历史的依赖；缺省按有状态处理，正确性优先。 */
  dependency?: import('@363045841yyt/klinechart-plot-contracts').ComputeDependency
  /** 每个执行器创建独立的增量 calculator；事件随输出返回。 */
  createCompute?: () => CalculationCompute & { dispose?(): void }
  /** 只影响 calculator 输出的默认参数，不包含 show* 等展示配置。 */
  defaultInputs: import('../calculation/types.js').CalculationInputs
  /** 参数展示声明，按参数名索引；缺省时面板用参数名当标题。 */
  inputDefs?: Readonly<Record<string, IndicatorInputDisplay>>
  compute: CalculationCompute
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
export type IndicatorMetadata<_T = unknown> = ScriptDefinitionKind & {
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
   * 显示名称（用于日志和调试）
   */
  displayName: string

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

  /** 指标选择器 UI 元数据：内置指标来自静态 uiMeta 表；外部指标随定义携带。 */
  ui?: { name?: string; description?: string; params?: readonly unknown[] }

  /**
   * 通用指标坐标轴配置。
   */
  scale?: {
    indicatorKey?: string
    label?: string
    decimals?: number
    format?: (value: number) => string
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
