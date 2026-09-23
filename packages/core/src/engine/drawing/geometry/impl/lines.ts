// 图元的线表：定义图元由哪些持久化锚点构成线段，并声明该线段是否开启中点垂直手柄。
// 命中整段、中点手柄的绘制与拖拽共用这一份定义；未登记的图元由锚点顺序推导线段。

import type { DrawingKind } from '../../types.js'
import type { DrawingLine, VerticalHandleLine } from '../types.js'

// ---- Table ----

/**
 * 各图元的线构成。
 * 三条通道图元的两条线都开启中点垂直手柄：拖拽只平移这条线，另一条线不动，因此通道宽度会改变。
 */
const LINES: Partial<Record<DrawingKind, readonly DrawingLine[]>> = {
  'parallel-channel': [
    { from: 0, to: 1, verticalHandle: true },
    { from: 2, to: 3, verticalHandle: true },
  ],
  'flat-line': [
    { from: 0, to: 1, verticalHandle: true },
    { from: 2, to: 3, verticalHandle: true },
  ],
  'disjoint-channel': [
    { from: 0, to: 1, verticalHandle: true },
    { from: 2, to: 3, verticalHandle: true },
  ],
}

const NO_LINES: readonly DrawingLine[] = []
const NO_HANDLE_LINES: readonly VerticalHandleLine[] = []

/**
 * 返回图元的线。
 * @param kind 图元种类
 * @returns 线列表；未登记的图元返回空数组
 */
export function getLines(kind: DrawingKind): readonly DrawingLine[] {
  return LINES[kind] ?? NO_LINES
}

/**
 * 返回开启中点垂直手柄的线。
 * @param kind 图元种类
 * @returns 手柄线列表；未登记或未开启手柄时返回空数组
 */
export function getVerticalHandleLines(kind: DrawingKind): readonly VerticalHandleLine[] {
  const lines = LINES[kind]
  if (!lines) return NO_HANDLE_LINES
  return lines.flatMap((line, index) =>
    line.verticalHandle ? [{ index, from: line.from, to: line.to }] : [],
  )
}
