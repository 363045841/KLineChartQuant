/** 绘图拖拽的命中目标与拖拽策略：决定一次拖拽要一起移动哪些锚点。 */

import type { DrawingKind } from '../../foundation/plugin/index.js'

/** 拖拽命中目标。 */
export type DrawingDragTarget =
  | {
      readonly type: 'anchor'
      /** 拖拽锚点下标。 */
      readonly index: number
    }
  | {
      readonly type: 'edge'
      /** 拖拽边的锚点下标组 */
      readonly anchors: readonly [number, number]
    }
  | {
      readonly type: 'all'
    }

/** 把命中目标解析为一起按同一屏幕位移移动的锚点下标。 */
export type DrawingDragStrategy = (
  target: DrawingDragTarget,
  anchorCount: number,
) => readonly number[]

/** 缺省策略：点只动自身、边动两端、整体动全部。 */
const defaultDrawingDragStrategy: DrawingDragStrategy = (target, anchorCount) => {
  switch (target.type) {
    case 'anchor':
      return [target.index]
    case 'edge':
      return [target.anchors[0], target.anchors[1]]
    case 'all':
      return Array.from({ length: anchorCount }, (_item, index) => index)
  }
}

/** 各图元的跟随规则；未登记的图元走缺省策略。 */
const drawingDragStrategies: Partial<Record<DrawingKind, DrawingDragStrategy>> = {}

/**
 * 解析一次拖拽要一起移动的锚点下标。
 * @param kind 被拖拽图元的种类
 * @param target 本次拖拽的命中目标
 * @param anchorCount 被拖拽图元的持久化锚点数
 */
export function resolveDragAnchors(
  kind: DrawingKind,
  target: DrawingDragTarget,
  anchorCount: number,
): readonly number[] {
  const strategy = drawingDragStrategies[kind] ?? defaultDrawingDragStrategy
  return strategy(target, anchorCount)
}
