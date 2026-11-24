/**
 * 轴区间绘制：把选中对象的价格范围带铺在对应值轴列的底层。
 *
 * 与标签共用绘制原语通道，不在轴画布上直写 Canvas 状态。
 */

import type { AxisColumn } from '@/engine/axisLabels/index.js'
import type { YAxisRange } from '@/foundation/plugin/types.js'
import { primitiveSink } from '@/rendering/primitives/impl/paint.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'

/**
 * 在单条值轴列内绘制范围带。
 *
 * @param ctx 目标轴 canvas 的 2D 上下文
 * @param ranges 本列的范围带（topY / bottomY 相对 Pane 顶部）
 * @param column 列几何：offsetX 与 width 界定列范围
 */
export function paintAxisRanges(
  ctx: CanvasRenderingContext2D,
  ranges: ReadonlyArray<YAxisRange>,
  column: Pick<AxisColumn, 'dpr' | 'width' | 'offsetX'>,
): void {
  const left = column.offsetX
  const right = left + column.width
  if (ranges.length === 0 || right <= left) return
  const commands: PaintPrimitive[] = ranges.map((range) => {
    const top = Math.min(range.topY, range.bottomY)
    const bottom = Math.max(range.topY, range.bottomY)
    return {
      kind: 'fill',
      paths: [
        [
          { x: left, y: top },
          { x: right, y: top },
          { x: right, y: bottom },
          { x: left, y: bottom },
        ],
      ],
      color: range.color,
      opacity: range.opacity,
    }
  })
  primitiveSink()(ctx, commands, column.dpr)
}
