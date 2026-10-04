/** 柱状图共用的物理像素投影，宽度和滚动偏移分别量化。 */
import type { ScreenRectBatch, WorldRectBatch } from '../types.js'

/** 将世界矩形投影到屏幕；同一帧共用整数滚动量，禁止分别取整左右边界。 */
export function projectBarBatches(
  batches: readonly WorldRectBatch[],
  scrollLeft: number,
  dpr: number,
): ScreenRectBatch[] {
  const scrollPx = Math.round(scrollLeft * dpr)
  return batches
    .filter((batch) => batch.count > 0)
    .map((batch) => {
      const buf = new Float32Array(batch.count * 4)
      for (let offset = 0; offset < buf.length; offset += 4) {
        buf[offset] = Math.round(batch.buf[offset]! * dpr) - scrollPx
        buf[offset + 1] = Math.round(batch.buf[offset + 1]! * dpr)
        buf[offset + 2] = Math.max(1, Math.round(batch.buf[offset + 2]! * dpr))
        buf[offset + 3] = Math.max(1, Math.round(batch.buf[offset + 3]! * dpr))
      }
      return { buf, count: batch.count, color: batch.color }
    })
}

/** 将数值端点投影到零轴矩形，正负柱和零值统一保留至少一个物理像素。 */
export function barVerticalRect(valueY: number, baseY: number, dpr: number) {
  const valuePx = Math.round(valueY * dpr)
  const basePx = Math.round(baseY * dpr)
  const heightPx = Math.max(1, Math.abs(basePx - valuePx))
  return {
    // 小于一个物理像素的正负柱仍保留在零轴的正确一侧。
    y: (valueY > baseY ? basePx : Math.min(valuePx, basePx - 1)) / dpr,
    height: heightPx / dpr,
  }
}
