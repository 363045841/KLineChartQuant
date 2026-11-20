/** 柱状图共用的物理像素投影；与公共矩形原语使用同一屏幕坐标规则。 */
import type { WorldRectBatch } from '../types.js'

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
