/**
 * interaction 子模块对外契约：工具 ID、拖拽策略与命中结果类型。
 *
 * 仅存放跨子模块引用或被 barrel 公开的类型；交互实现细节留在 impl/。
 * 本文件不得 import 同子模块 impl/。
 */

import type { DrawingLabelPosition } from '@/foundation/plugin/types.js'
import type { Point } from '../../../foundation/geometry/types.js'
import type { DrawingObject } from '../types.js'

/**
 * 绘图工具 ID 常量表：运行时切换工具、构建工具栏都必须引用这里，
 * 禁止在业务代码中散落字符串字面量。
 */
export const DrawingTool = {
  /** 选择/交互模式。 */
  Cursor: 'cursor',
  /** 框选模式。 */
  BoxSelect: 'box-select',
  /** 趋势线段。 */
  TrendLine: 'trend-line',
  /** 射线。 */
  Ray: 'ray',
  /** 水平线。 */
  HorizontalLine: 'h-line',
  /** 斐波那契回撤。 */
  FibRetracement: 'fib-retracement',
  /** 矩形。 */
  Rectangle: 'rectangle',
  /** 箭头。 */
  Arrow: 'arrow',
  /** 水平射线。 */
  HorizontalRay: 'h-ray',
  /** 垂直线。 */
  VerticalLine: 'v-line',
  /** 十字线。 */
  CrosshairLine: 'crosshair-line',
  /** 信息线。 */
  InfoLine: 'info-line',
  /** 平行通道。 */
  ParallelChannel: 'parallel-channel',
  /** 回归通道。 */
  RegressionChannel: 'regression-channel',
  /** 平滑顶底。 */
  FlatLine: 'flat-line',
  /** 不相交通道。 */
  DisjointChannel: 'disjoint-channel',
} as const

/** 所有支持的绘图工具 ID，由 DrawingTool 常量派生。 */
export type DrawingToolId = (typeof DrawingTool)[keyof typeof DrawingTool]

/** 选择/交互模式的绘图工具 ID，也是未指定工具时的默认值。 */
export const CURSOR_DRAWING_TOOL_ID = DrawingTool.Cursor

/** 框选模式的绘图工具 ID。 */
export const BOX_SELECT_DRAWING_TOOL_ID = DrawingTool.BoxSelect

/** 锚点跟随位移的分量系数：1 同向、-1 反向、0 不跟随，缺省为 1。 */
export interface DragFollow {
  /** 时间轴（屏幕 X）位移系数。 */
  readonly time?: 1 | 0 | -1
  /** 价格轴（屏幕 Y）位移系数。 */
  readonly price?: 1 | 0 | -1
}

/** 一次锚点拖拽中要移动的锚点及其位移系数；follow 缺省表示两个分量都同向跟随。 */
export interface MovingAnchor {
  /** 移动的锚点下标。 */
  readonly index: number
  /** 各分量接受的位移系数。 */
  readonly follow?: DragFollow
}

/** 框选状态使用 Pane 内逻辑像素，不进入 kernel 或持久化图元。 */
export type DrawingSelectionMarquee = {
  paneId: string
  start: Point
  end: Point
}

/** 命中的拖拽目标：锚点、线段中点垂直手柄，或图元主体（整体拖拽）。命中与拖拽会话共用。 */
export type DrawingDragTarget =
  | { readonly type: 'anchor'; readonly index: number }
  | { readonly type: 'vertical-handle'; readonly lineIndex: number }
  | { readonly type: 'all' }

/** 命中检测结果：命中的图元及其拖拽目标。 */
export interface HitResult {
  readonly drawing: DrawingObject
  readonly target: DrawingDragTarget
}

/** 线段/填充标签热点，携带与绘制完全一致的锚点、旋转、对齐、基线与字号。 */
export interface LineLabelTarget {
  readonly drawingId: string
  readonly targetKind: 'line' | 'area'
  readonly lineIndex: number
  readonly x: number
  readonly y: number
  /** 文字沿线段方向的可读旋转角（弧度）。 */
  readonly rotation: number
  readonly text: string
  readonly position: DrawingLabelPosition
  /** 绘制时的水平对齐。 */
  readonly align: CanvasTextAlign
  /** 绘制时的基线，决定锚点贴文本块的哪一边。 */
  readonly baseline: CanvasTextBaseline
  /** 绘制时的字号（px）。 */
  readonly fontSize: number
}
