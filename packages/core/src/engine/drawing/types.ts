/**
 * 绘图模块对外契约：图元领域模型、锚点/标签与图形定义接口。
 *
 * 图形对象与样式引用公共契约；屏幕 primitive 由 foundation/plugin 拥有。
 * 本模块只增加当前帧已解析坐标和图形计算接口，不再重复定义领域模型。
 */

import type {
  DrawingKind,
  DrawingObject,
  PersistedDrawingAnchor,
} from '@363045841yyt/klinechart-plot-contracts'
import type { Point } from '../../foundation/geometry/types.js'
import type { DrawingPrimitive, PaneInfo } from '../../foundation/plugin/types.js'
import type { KLineData } from '../../foundation/types/price.js'

export type {
  DrawingAnchorType,
  DrawingKind,
  DrawingLabel,
  DrawingLabelIndex,
  DrawingLabels,
  DrawingObject,
  DrawingTimeframeVisibility,
  DrawingWorkspaceId,
  PersistedDrawingAnchor,
} from '@363045841yyt/klinechart-plot-contracts'

/** 当前帧或交互会话使用的已解析锚点；用户文档持久化时间，脚本结果可以显式使用索引。 */
export type ResolvedDrawingAnchor = PersistedDrawingAnchor & {
  index: number
}
/** 当前数据帧已按时间戳解析逻辑索引的绘图对象。 */
export type ResolvedDrawingObject<TParams = Record<string, unknown>> = Omit<
  DrawingObject<TParams>,
  'anchors'
> & {
  anchors: ResolvedDrawingAnchor[]
}

export type DrawingGeometry = {
  primitives: DrawingPrimitive[]
  bounds?: { left: number; top: number; right: number; bottom: number }
  meta?: Record<string, unknown>
  computedAnchors?: ResolvedDrawingAnchor[]
}

export type DrawingComputeContext = {
  pane: PaneInfo
  visibleData: KLineData[]
  seriesData: KLineData[]
  range: { start: number; end: number }
  kLinePositions: number[]
  kLineCenters: number[]
  kWidth: number
  kGap: number
  dpr: number
  paneWidth: number
  viewport: {
    scrollLeft: number
    plotWidth: number
    plotHeight: number
  }
  toScreen(anchor: ResolvedDrawingAnchor): Point
}

/**
 * 图元在逻辑索引轴上的水平范围；null 表示该侧无界。
 * 帧投影据此跳过视口外图元，避免为不可见图元计算几何。
 */
export type DrawingHorizontalExtent = {
  readonly start: number | null
  readonly end: number | null
}

/**
 * 图元种类声明：每种 kind 一条，所有按种类分派的事实都从这里取。
 *
 * 只有声明性事实进表；几何计算属于渲染实现，留在各自的图形定义里。
 */
export interface DrawingKindSpec {
  /** 对象树、图例、工具栏与 Agent 共用的显示名。 */
  readonly label: string
  /** 创建时用户点击的锚点数。 */
  readonly inputAnchors: 1 | 2 | 3
  /** 物化后的持久锚点数；缺省等于 inputAnchors（矩形与三锚点通道会补齐）。 */
  readonly persistedAnchors?: 1 | 2 | 3 | 4
  /** 通道类：创建时带半透明填充，命中包含内部区域。 */
  readonly filled?: boolean
  /** 锚点投影到哪些轴；缺省两侧都投。 */
  readonly axisLabels?: 'both' | 'price' | 'time'
  /** `drawing_create` 是否开放该种类。 */
  readonly agentExposed: boolean
  /** 线段缺省延伸方向；缺省不延伸。 */
  readonly extend?: 'none' | 'left' | 'right' | 'both'
  /** 创建时写入的缺省参数；缺省为空。 */
  readonly defaultParams?: Readonly<Record<string, unknown>>
}

export interface DrawingDefinition<TParams = Record<string, unknown>> {
  kind: DrawingKind
  /** 水平索引范围；投影阶段先裁剪再计算几何。 */
  extent(drawing: ResolvedDrawingObject<TParams>): DrawingHorizontalExtent
  compute(drawing: ResolvedDrawingObject<TParams>, context: DrawingComputeContext): DrawingGeometry
}
