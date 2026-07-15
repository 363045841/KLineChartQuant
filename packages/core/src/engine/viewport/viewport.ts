import type { KLineData } from '../../foundation/types/price'
import type { PriceRange } from '../scale/price'
import { getPhysicalKLineConfig } from '../utils/klineConfig'

/**
 * 计算当前视口可见的 K 线索引范围（使用物理像素对齐）。
 *
 * - 所有计算在物理像素空间进行，确保与 calcKLinePositions 一致
 * - 会额外在左右各扩展 1 根（start-1/end+1），用于避免边缘裁剪带来的”断线/缺一根”观感
 *
 * @param scrollLeft 容器当前横向滚动量（逻辑像素）
 * @param viewWidth  绘图区域宽度（plotWidth，逻辑像素，不含右侧 yAxis）
 * @param kWidth     单根 K 线宽度（逻辑像素）
 * @param kGap       K 线间距（逻辑像素）
 * @param totalDataCount 数据总条数
 * @param dpr        设备像素比
 */
export function getVisibleRange(
  scrollLeft: number,
  viewWidth: number,
  kWidth: number,
  kGap: number,
  totalDataCount: number,
  dpr: number = 1,
): { start: number; end: number } {
  // 使用统一的物理像素配置，确保与 calcKLinePositions 完全一致
  const { unitPx, startXPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)

  // scrollLeft 和 viewWidth 转换到物理像素空间
  const scrollLeftPx = scrollLeft * dpr
  const viewWidthPx = viewWidth * dpr

  // 计算可见范围（物理像素空间整数运算）
  const start = Math.floor((scrollLeftPx - startXPx) / unitPx) - 1
  const end = Math.min(
    totalDataCount,
    Math.ceil((scrollLeftPx + viewWidthPx - startXPx) / unitPx) + 1,
  )

  return { start, end }
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
