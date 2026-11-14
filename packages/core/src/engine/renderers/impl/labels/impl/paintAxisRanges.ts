/**
 * 轴区间绘制：把选中对象的价格范围带铺在对应轴列底层。
 *
 * 范围带用物理像素直接填充，避免受标签绘制设置的文本变换影响；标签随后覆盖其上。
 */
import type { YAxisRange } from '@/foundation/plugin/types.js'
import type { AxisLabelMetrics } from '../types.js'

/**
 * 在单条轴列内绘制范围带。
 *
 * @param ctx 目标轴 canvas 的 2D 上下文
 * @param ranges 本列的范围带（`topY`/`bottomY` 相对 Pane）
 * @param metrics 画布度量；`offsetX` 与 `axisWidth` 界定列范围
 */
export function paintAxisRanges(
  ctx: CanvasRenderingContext2D,
  ranges: ReadonlyArray<YAxisRange>,
  metrics: AxisLabelMetrics,
): void {
  if (ranges.length === 0) return
  const dpr = metrics.dpr
  const left = Math.round((metrics.offsetX ?? 0) * dpr)
  const width = Math.round(metrics.axisWidth * dpr)
  if (width <= 0) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  for (const range of ranges) {
    const top = Math.min(range.topY, range.bottomY)
    const bottom = Math.max(range.topY, range.bottomY)
    const topPx = Math.round(top * dpr)
    const heightPx = Math.round((bottom - top) * dpr)
    if (heightPx <= 0) continue
    ctx.globalAlpha = range.opacity
    ctx.fillStyle = range.color
    ctx.fillRect(left, topPx, width, heightPx)
  }
  ctx.restore()
}
