export function priceToY(
  price: number,
  maxPrice: number,
  minPrice: number,
  canvasHeight: number,
  paddingTop: number,
  paddingBottom: number,
): number {
  const range = maxPrice - minPrice || 1
  const ratio = (price - minPrice) / range

  const viewHeight = Math.max(1, canvasHeight - paddingTop - paddingBottom)
  return paddingTop + viewHeight * (1 - ratio)
}

/**
 * 将逻辑像素 y 反算回价格
 * - y 是相对于绘图区顶部的逻辑像素坐标（不含额外 translate）
 * - paddingTop/paddingBottom 需与 priceToY 使用一致
 */
export function yToPrice(
  y: number,
  maxPrice: number,
  minPrice: number,
  canvasHeight: number,
  paddingTop: number,
  paddingBottom: number,
): number {
  const range = maxPrice - minPrice || 1
  const viewHeight = Math.max(1, canvasHeight - paddingTop - paddingBottom)
  const clampedY = Math.min(Math.max(y, paddingTop), paddingTop + viewHeight)
  const ratio = 1 - (clampedY - paddingTop) / viewHeight
  return minPrice + ratio * range
}
