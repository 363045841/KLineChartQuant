/**
 * 绘图渲染子模块契约：投影器依赖与 primitive 渲染器集合。
 *
 * 这里只声明渲染层的输入/输出契约，实现位于 impl/；
 * 调用方依赖本文件，不反向依赖 impl/。
 */

import type {
  AreaPrimitive,
  ArrowPrimitive,
  LinePrimitive,
  PointPrimitive,
  TextPrimitive,
} from '@/foundation/plugin/index.js'
import type { ReadonlySignal } from '@/foundation/reactivity/signal.js'
import type { DrawingObject } from '../types.js'

/** DrawingStore 的依赖：kernel 业务信号与可选会话层 overlay。 */
export interface DrawingStoreDeps {
  drawings$: ReadonlySignal<ReadonlyArray<DrawingObject>>
  selectedDrawingIds$: ReadonlySignal<ReadonlyArray<string>>
  /** 会话层覆盖（拖拽/预览）；缺省为空 */
  getOverlay?: () => ReadonlyArray<DrawingObject>
}

/** 各 primitive 的 Canvas2D 渲染器集合。 */
export type PrimitiveRendererSet = {
  point: (ctx: CanvasRenderingContext2D, primitive: PointPrimitive, dpr: number) => void
  line: (
    ctx: CanvasRenderingContext2D,
    primitive: LinePrimitive,
    viewportClip: { left: number; top: number; right: number; bottom: number },
    dpr: number,
  ) => void
  area: (ctx: CanvasRenderingContext2D, primitive: AreaPrimitive, dpr: number) => void
  text: (ctx: CanvasRenderingContext2D, primitive: TextPrimitive, dpr: number) => void
  arrow: (ctx: CanvasRenderingContext2D, primitive: ArrowPrimitive, dpr: number) => void
}
