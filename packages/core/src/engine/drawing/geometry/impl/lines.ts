// 图元的线表：定义图元由哪些持久化锚点构成线段，并声明该线段中点手柄的拖拽轴。
// 命中整段与中点手柄的绘制、拖拽共用这一份定义；未登记的图元由锚点顺序推导线段。

import type { DrawingKind } from '../../types.js'
import type { DrawingLine, LineHandle } from '../types.js'

// ---- Table ----

/**
 * 各图元的线构成。
 *
 * 通道类：两条线都开价格轴手柄，拖拽只平移这条线，另一条不动，因此通道宽度会改变。
 * 矩形：四角顺时针为左上、右上、右下、左下；上下边为价格轴手柄（改高度），
 * 左右边为时间轴手柄（改宽度），与 TradingView 的四边中点一致。
 */
const LINES: Partial<Record<DrawingKind, readonly DrawingLine[]>> = {
  'parallel-channel': [
    { from: 0, to: 1, handle: 'price' },
    { from: 2, to: 3, handle: 'price' },
  ],
  'flat-line': [
    { from: 0, to: 1, handle: 'price' },
    { from: 2, to: 3, handle: 'price' },
  ],
  'disjoint-channel': [
    { from: 0, to: 1, handle: 'price' },
    { from: 2, to: 3, handle: 'price' },
  ],
  rectangle: [
    { from: 0, to: 1, handle: 'price' },
    { from: 1, to: 2, handle: 'time' },
    { from: 2, to: 3, handle: 'price' },
    { from: 3, to: 0, handle: 'time' },
  ],
}

const NO_LINES: readonly DrawingLine[] = []
const NO_HANDLES: readonly LineHandle[] = []

/**
 * 返回图元的线。
 * @param kind 图元种类
 * @returns 线列表；未登记的图元返回空数组
 */
export function getLines(kind: DrawingKind): readonly DrawingLine[] {
  return LINES[kind] ?? NO_LINES
}

/**
 * 返回开启中点手柄的线及其拖拽轴。
 * @param kind 图元种类
 * @returns 手柄线列表；未登记或未开启手柄时返回空数组
 */
export function getLineHandles(kind: DrawingKind): readonly LineHandle[] {
  const lines = LINES[kind]
  if (!lines) return NO_HANDLES
  return lines.flatMap((line, index) =>
    line.handle ? [{ index, from: line.from, to: line.to, axis: line.handle }] : [],
  )
}
