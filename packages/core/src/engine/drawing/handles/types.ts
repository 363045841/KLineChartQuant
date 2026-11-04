/**
 * handles 子模块对外契约：手柄行与锚点投影端口。
 *
 * 手柄是派生量：位置每次由「图元锚点 + 当前视口投影」现算，不进入持久化文档，
 * 也不进入撤销历史。绘制、命中、拖动三方消费同一份布局结果。
 *
 * 依赖方向：本模块只依赖图形基础类型与坐标投影工具，不依赖 render/ 与 interaction/，
 * 由它们反向消费；渲染阶段与交互阶段各自提供一份投影端口。
 */

import type { Point } from '@/foundation/geometry/types.js'
import type { ScreenDrawingAnchor } from '@/foundation/plugin/index.js'
import type { DrawingKind, PersistedDrawingAnchor } from '../types.js'

/**
 * 手柄布局所需的最小图元形状：种类 + 持久化锚点。
 * 只声明布局真正读取的字段，帧投影与工作副本两种图元都能直接传入。
 */
export interface DrawingHandleSource<
  Anchor extends PersistedDrawingAnchor = PersistedDrawingAnchor,
> {
  /** 图元种类，决定线中点手柄是否存在，以及靠边手柄补哪根轴。 */
  readonly kind: DrawingKind
  /** 持久化锚点；锚点手柄与线中点手柄都由它派生。 */
  readonly anchors: readonly Anchor[]
}

/** 图元所在 Pane 的边界（逻辑像素）。 */
export interface DrawingHandleBounds {
  /** 绘图区宽度：水平类手柄的右侧基准。 */
  readonly plotWidth: number
  /** Pane 高度：垂直类手柄的底部基准。 */
  readonly paneHeight: number
}

/**
 * 锚点 → 屏幕投影的最小端口。
 * 渲染阶段用本帧封存的几何实现，交互阶段用视口适配器实现，算法不关心来源。
 */
export interface DrawingHandlePort<Anchor extends PersistedDrawingAnchor = PersistedDrawingAnchor> {
  /** Pane 边界；缺失时不产生靠边手柄，锚点手柄不受影响。 */
  readonly bounds: DrawingHandleBounds | null
  /**
   * 投影单个锚点；单轴锚点（水平线 / 垂直线）保留单轴语义。
   * @param anchor 待投影锚点
   * @returns 屏幕投影；无法投影时返回 null
   */
  projectAnchor(anchor: Anchor): ScreenDrawingAnchor | null
}

/** 手柄布局选项。 */
export interface DrawingHandleLayoutOptions {
  /** 图元是否处于选中态：线中点手柄只在选中态出现。 */
  readonly selected: boolean
}

/** 绘图拖拽光标：手柄行与命中结果在产出处声明，宿主只透传，不在中间层二次映射。 */
export type DrawingDragCursor = 'default' | 'move' | 'ns-resize' | 'ew-resize'

/** 锚点手柄：位置由锚点自身投影得出，拖动写回该锚点。 */
export interface AnchorHandle {
  readonly kind: 'anchor'
  /** 在 drawing.anchors 中的下标，同时是命中结果里的锚点下标。 */
  readonly anchorIndex: number
  /** 屏幕位置（Pane 内逻辑像素）。 */
  readonly point: Point
  /** 拖动该手柄时的光标。 */
  readonly cursor: DrawingDragCursor
}

/** 线中点手柄：位置是两个锚点的中点，拖动只沿价格轴平移这条线。 */
export interface LineMidHandle {
  readonly kind: 'line-mid'
  /** 线表下标，命中与拖动据此定位被平移的线。 */
  readonly lineIndex: number
  /** 屏幕位置（Pane 内逻辑像素）。 */
  readonly point: Point
  /** 拖动该手柄时的光标。 */
  readonly cursor: DrawingDragCursor
}

/** 手柄行：锚点手柄或线中点手柄。 */
export type DrawingHandle = AnchorHandle | LineMidHandle
