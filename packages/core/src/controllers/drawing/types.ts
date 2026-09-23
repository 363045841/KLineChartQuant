/**
 * drawing 模块对外契约入口。
 *
 * 绘图控制器的状态与方法契约在此定义；共用绘图端口仍由共享类型提供。
 */

import type { DrawingToolId } from '../../engine/drawing/index.js'
import type { Signal } from '../../foundation/reactivity/index.js'

export type { DrawingToolId } from '../../engine/drawing/index.js'

export type {
  CreateDrawingInput,
  DrawingChartAdapter,
  DrawingChartViewport,
  DrawingControllerCallbacks,
  DrawingDocumentPort,
  DrawingLabelIndex,
  DrawingLabelPosition,
  DrawingObject,
  DrawingSessionPort,
  DrawingStyle,
  DrawingStyleKey,
  DrawingViewportPort,
  UpdateDrawingPatch,
} from '../types.js'

export interface DrawingState {
  readonly activeTool: DrawingToolId | null
  readonly drawingCount: number
}

export interface DrawingController {
  readonly state: Signal<DrawingState>
  setActiveTool(tool: DrawingToolId | null): void
  clearAll(): void
  deleteLast(): void
  dispose(): void
}

/** createDrawingController 的初始化参数。 */
export interface DrawingInit {
  /** 初始选中的绘图工具，null 表示光标模式 */
  initialActiveTool?: DrawingToolId | null
  /** 初始已提交的绘图数量，负数会被归零 */
  initialDrawingCount?: number
}
