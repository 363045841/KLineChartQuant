/** Columns 槽位填充：屏幕槽界左右各留一个物理像素，与蜡烛实体和影线无关。 */
import type { ColumnsPlot } from '@363045841yyt/klinechart-plot-contracts'
import { barVerticalRect } from '@/engine/renderers/barGeometry/impl/projectBars.js'
import { slotWorldX } from '@/foundation/geometry/slotGrid.js'
import type { PrimitiveRenderContext } from '@/foundation/plugin/index.js'
import { worldXToScreenX } from '@/foundation/utils/pixelAlign.js'
import type { PaintPrimitive } from '@/rendering/primitives/types.js'

/** 槽内两侧固定的物理像素留白，不随 DPR、密度或缩放增长。 */
const COLUMN_SLOT_INSET_PX = 1

/** 每次重放按当前滚动量投影共享槽界；像素余量由柱宽吸收，不能转移到间隙。 */
export function projectColumnPrimitives(
  plot: ColumnsPlot,
  points: ReadonlyMap<number, { y: number }>,
  context: Pick<PrimitiveRenderContext, 'slotGrid' | 'scrollLeft' | 'dpr' | 'paneWidth' | 'pane'>,
): PaintPrimitive[] {
  const { slotGrid, scrollLeft, dpr } = context
  const baselineY = context.pane.yAxis.priceToY(plot.baseline)
  if (!Number.isFinite(baselineY)) return []
  const batches = new Map<string, number[]>()
  for (const [index, point] of points) {
    const slotLeft = worldXToScreenX(slotWorldX(slotGrid, index - 0.5), scrollLeft, dpr) * dpr
    const slotRight = worldXToScreenX(slotWorldX(slotGrid, index + 0.5), scrollLeft, dpr) * dpr
    const slotWidth = Math.round(slotRight - slotLeft)
    // 不足一个物理像素的槽位不绘制；1–2px 槽位取消留白，避免负宽或跨槽覆盖。
    if (slotWidth <= 0) continue
    const inset = slotWidth > COLUMN_SLOT_INSET_PX * 2 ? COLUMN_SLOT_INSET_PX : 0
    const left = slotLeft + inset
    const width = slotWidth - inset * 2
    if (left + width < 0 || left > context.paneWidth * dpr) continue
    const vertical = barVerticalRect(point.y, baselineY, dpr)
    const color = plot.data[index - plot.offset]?.color ?? plot.color
    let values = batches.get(color)
    if (!values) {
      values = []
      batches.set(color, values)
    }
    values.push(left / dpr, vertical.y, width / dpr, vertical.height)
  }
  return [...batches].map(([color, values]) => ({
    kind: 'rects',
    color,
    data: new Float64Array(values),
  }))
}
