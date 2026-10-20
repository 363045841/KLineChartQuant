/**
 * 绘图模块对外契约：图元领域模型、锚点/标签与图形定义接口。
 *
 * 图形对象与样式引用公共契约；屏幕 primitive 由 foundation/plugin 拥有。
 * 本模块只增加当前帧已解析坐标和图形计算接口，不再重复定义领域模型。
 */

import type { Point } from '../../foundation/geometry/types.js'
import type {
  DrawingObject,
  PersistedDrawingAnchor,
  DrawingKind,
} from '@363045841yyt/klinechart-plot-contracts'
import type {
  DrawingPrimitive, PaneInfo,
} from '../../foundation/plugin/types.js'
import type { KLineData } from '../../foundation/types/price.js'

export type {
  DrawingAnchorType, DrawingKind, DrawingLabel, DrawingLabelIndex, DrawingLabels,
  DrawingWorkspaceId, DrawingObject, PersistedDrawingAnchor,
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
  kBarRects: Array<{ x: number; width: number }>
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

export interface DrawingDefinition<TParams = Record<string, unknown>> {
  kind: DrawingKind
  minAnchors: number
  maxAnchors: number
  compute(drawing: ResolvedDrawingObject<TParams>, context: DrawingComputeContext): DrawingGeometry
}
