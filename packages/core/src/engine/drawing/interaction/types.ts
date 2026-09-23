/**
 * interaction 子模块对外契约：工具 ID、磁吸档位、拖拽策略与命中结果类型。
 *
 * 仅存放跨子模块引用或被 barrel 公开的类型；交互实现细节留在 impl/。
 * 本文件不得 import 同子模块 impl/。
 */

import type { DrawingLabelPosition, ScreenPoint } from '../../../foundation/plugin/types.js'
import type { DrawingObject } from '../types.js'

/**
 * 所有支持的绘图工具 ID。
 * UI 层通过 setTool(toolId) 切换工具，cursor 表示选择/交互模式。
 */
export type DrawingToolId =
  | 'cursor'
  | 'box-select'
  | 'trend-line'
  | 'ray'
  | 'h-line'
  | 'fib-retracement'
  | 'rectangle'
  | 'arrow'
  | 'h-ray'
  | 'v-line'
  | 'crosshair-line'
  | 'info-line'
  | 'parallel-channel'
  | 'regression-channel'
  | 'flat-line'
  | 'disjoint-channel'

/** 选择/交互模式的绘图工具 ID，也是未指定工具时的默认值。 */
export const CURSOR_DRAWING_TOOL_ID: DrawingToolId = 'cursor'

/** 磁吸三态：off 关闭，weak 吸高低点，strong 吸 OHLC 四值。 */
export type MagnetMode = 'off' | 'weak' | 'strong'

/** 生效档位（off 已在调用方过滤，进入磁吸模块的必为吸附档）。 */
export type ActiveMagnetMode = Exclude<MagnetMode, 'off'>

/** 磁吸配置：档位决定候选价格集合与吸附半径。 */
export interface MagnetSnapConfig {
  mode: ActiveMagnetMode
}

/** 吸附后的容器局部坐标。 */
export interface SnappedPoint {
  x: number
  y: number
}

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
  start: ScreenPoint
  end: ScreenPoint
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
