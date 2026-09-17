/** 绘图拖拽的命中目标。 */
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
