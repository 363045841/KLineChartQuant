/**
 * 绘图模块对外契约：图元领域模型、锚点/标签与图形定义接口。
 *
 * 渲染 primitive（`DrawingStyle` / `ScreenPoint` / `DrawingPrimitive` 等）是
 * foundation 的渲染契约（`RenderContext` 依赖它），由 foundation/plugin 拥有，
 * 这里只引用不重复定义。
 */

import type {
  DrawingLabelPosition,
  DrawingPrimitive,
  DrawingStyle,
  PaneInfo,
  ScreenPoint,
} from '../../foundation/plugin/types.js'
import type { ChartWorkspaceId } from '../../foundation/types/chartView.js'
import type { KLineData } from '../../foundation/types/price.js'

/** 锚点语义：普通点、价格水平线或时间垂线。 */
export type DrawingAnchorType = 'point' | 'horizontal' | 'vertical'

/** 图元持久化锚点。所有新图元必须显式声明 type。 */
export type PersistedDrawingAnchor = {
  id: string
  type?: DrawingAnchorType
  /**
   * 数据锚点的时间；futureOffset 存在时表示创建时最后一根 K 线的时间。
   */
  time?: number | string
  /**
   * 基准 K 线之后的未来时间轴槽位数。只用于未来锚点，必须为正整数。
   */
  futureOffset?: number
  price: number
}

/** 当前帧或交互会话使用的锚点坐标；逻辑索引不得进入绘图持久化快照。 */
export type ResolvedDrawingAnchor = PersistedDrawingAnchor & {
  index: number
}

export type DrawingKind =
  | 'trend-line'
  | 'ray'
  | 'extended-line'
  | 'fib-retracement'
  | 'rectangle'
  | 'arrow'
  | 'horizontal-line'
  | 'horizontal-ray'
  | 'vertical-line'
  | 'cross-line'
  | 'info-line'
  | 'parallel-channel'
  | 'regression-channel'
  | 'flat-line'
  | 'disjoint-channel'

/** 绘图附属文本的持久化内容与位置。 */
export type DrawingLabel = {
  text: string
  position: DrawingLabelPosition
}

/** 绘图标签的键：图元定义输出的线段或填充区域序号。 */
export type DrawingLabelIndex = `${number}`

/** 绘图附属文本；键为图元定义输出的线段或填充区域序号。 */
export type DrawingLabels = {
  line: Record<DrawingLabelIndex, DrawingLabel>
  area: Record<DrawingLabelIndex, DrawingLabel>
}

/** 绘图所属的数据工作区。 */
export type DrawingWorkspaceId = ChartWorkspaceId

export type DrawingObject<TParams = Record<string, unknown>> = {
  id: string
  kind: DrawingKind
  paneId: string
  /** 未标记的历史图元按 K 线工作区处理。 */
  workspaceId?: DrawingWorkspaceId
  visible: boolean
  locked?: boolean
  zIndex?: number
  anchors: PersistedDrawingAnchor[]
  /** 用户输入的附属文本；几何位置和方向始终在渲染期推导。 */
  labels?: DrawingLabels
  params: TParams
  style: DrawingStyle
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
  toScreen(anchor: ResolvedDrawingAnchor): ScreenPoint
}

export interface DrawingDefinition<TParams = Record<string, unknown>> {
  kind: DrawingKind
  minAnchors: number
  maxAnchors: number
  compute(drawing: ResolvedDrawingObject<TParams>, context: DrawingComputeContext): DrawingGeometry
}
