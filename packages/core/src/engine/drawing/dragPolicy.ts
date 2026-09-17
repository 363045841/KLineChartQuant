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

/** 跟随的位移分量：完整位移 / 仅时间 / 仅价格。 */
export type DragFollowAxis = 'both' | 'time' | 'price'

/** 一次拖拽中要移动的锚点及其位移分量；axis 缺省为完整位移。 */
export interface MovingAnchor {
  /** 移动的锚点下标。 */
  readonly index: number
  /** 接受指针位移的分量。 */
  readonly axis?: DragFollowAxis
}

/** 把命中目标解析为一起移动的锚点。被拖锚点自身始终接受完整位移。 */
export type DrawingDragStrategy = (
  target: DrawingDragTarget,
  anchorCount: number,
) => readonly MovingAnchor[]

/** 缺省策略：点只动自身、边动两端、整体动全部。 */
const defaultDrawingDragStrategy: DrawingDragStrategy = (target, anchorCount) => {
  switch (target.type) {
    case 'anchor':
      return [{ index: target.index }]
    case 'edge':
      return [{ index: target.anchors[0] }, { index: target.anchors[1] }]
    case 'all':
      return Array.from({ length: anchorCount }, (_item, index) => ({ index }))
  }
}

/** 各图元的跟随规则；未登记的图元走缺省策略。 */
const drawingDragStrategies: Partial<Record<DrawingKind, DrawingDragStrategy>> = {
  /**
   * 平行通道的端点按角色跨线成对：0/2 为左端、1/3 为右端。
   * 拖动任一端点时，另一条线上的同角色端点按同一位移跟随，剩下两点固定，两条线向量始终相同。
   */
  'parallel-channel': (target, anchorCount) => {
    if (target.type === 'anchor') {
      // 角色对固定为左端 {0,2} 与右端 {1,3}，按下标升序返回。
      const role = target.index % 2
      return [{ index: role }, { index: role + 2 }]
    }
    // 拖一条边即整条线平移，另一条线不动，两条线仍平行。
    return defaultDrawingDragStrategy(target, anchorCount)
  },

  /**
   * 平滑顶底：0/1 为斜线端点，2/3 为水平线端点。
   * 同侧端点共享 X（0↔2、1↔3），水平线两端共享价格。
   */
  'flat-line': (target, anchorCount) => {
    if (target.type === 'anchor') {
      if (target.index < 2) {
        return [{ index: target.index }, { index: target.index + 2, axis: 'time' }]
      }
      // 水平线端点自由移动：斜线同侧端点只跟时间，水平线另一端只跟价格。
      return [
        { index: target.index },
        { index: target.index - 2, axis: 'time' },
        { index: target.index === 2 ? 3 : 2, axis: 'price' },
      ]
    }
    if (target.type === 'edge') {
      // 斜线平移时水平线两端只跟时间；水平线平移时斜线两端只跟时间。
      return target.anchors[0] === 0
        ? [{ index: 0 }, { index: 1 }, { index: 2, axis: 'time' }, { index: 3, axis: 'time' }]
        : [{ index: 2 }, { index: 3 }, { index: 0, axis: 'time' }, { index: 1, axis: 'time' }]
    }
    return defaultDrawingDragStrategy(target, anchorCount)
  },
}

/**
 * 解析一次拖拽要一起移动的锚点。
 * @param kind 被拖拽图元的种类
 * @param target 本次拖拽的命中目标
 * @param anchorCount 被拖拽图元的持久化锚点数
 */
export function resolveDragAnchors(
  kind: DrawingKind,
  target: DrawingDragTarget,
  anchorCount: number,
): readonly MovingAnchor[] {
  const strategy = drawingDragStrategies[kind] ?? defaultDrawingDragStrategy
  return strategy(target, anchorCount)
}
