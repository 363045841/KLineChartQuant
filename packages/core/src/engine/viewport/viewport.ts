/** 加载边界与可见数据价格范围的纯计算；可见槽位范围由视图策略派生。 */
import type { KLineData } from '../../foundation/types/price.js'
import type { PriceRange } from '../scale/index.js'

/** 左侧加载缓冲进入视口，意味着首根已加载 K 线之前出现空白。 */
export function hasLeftDataGap(scrollLeft: number, leftLoadBufferWidth: number): boolean {
  return scrollLeft < leftLoadBufferWidth
}

/**
 * 计算指定索引区间内的价格范围（max/min）。
 *
 * 主要用途：
 * - 为 pane 的 y 轴缩放与刻度提供 priceRange
 * - 为渲染器（网格线、极值标注等）提供可视区参考范围
 *
 * 注意：
 * - `endIndex` 为开区间（不包含）
 * - 若区间内无有效数据，会返回兜底范围 `{ maxPrice: 100, minPrice: 0 }`
 */
export function getVisiblePriceRange(
  data: KLineData[],
  startIndex: number,
  endIndex: number,
): PriceRange {
  let maxPrice = -Infinity
  let minPrice = Infinity

  for (let i = startIndex; i < endIndex && i < data.length; i++) {
    const e = data[i]
    if (!e) continue
    if (e.high > maxPrice) maxPrice = e.high
    if (e.low < minPrice) minPrice = e.low
  }

  if (!Number.isFinite(maxPrice) || !Number.isFinite(minPrice)) {
    return { maxPrice: 100, minPrice: 0 }
  }

  return { maxPrice, minPrice }
}
