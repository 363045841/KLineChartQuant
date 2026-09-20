import type { KLineData } from '../../foundation/types/price.js'
import type { VisibleRange } from '../layout/pane.js'
import { findVisibleBarRange } from './visibleBarIndex.js'

/** 主图真正落在视口内的 K 线高低点；供同帧多个消费者共享。 */
export type VisiblePriceExtrema = {
  min: number
  max: number
  minIndex: number
  maxIndex: number
}

export function computeVisiblePriceExtrema(
  data: readonly KLineData[],
  range: VisibleRange,
  kLineCenters: readonly number[],
  scrollLeft: number,
  paneWidth: number,
): VisiblePriceExtrema | null {
  const { first, last } = findVisibleBarRange(range, kLineCenters, scrollLeft, paneWidth)
  if (last < first) return null

  let max = -Infinity
  let min = Infinity
  let maxIndex = first
  let minIndex = first
  for (let index = first; index <= last; index++) {
    const item = data[index]
    if (!item) continue
    if (item.high >= max) {
      max = item.high
      maxIndex = index
    }
    if (item.low <= min) {
      min = item.low
      minIndex = index
    }
  }

  return Number.isFinite(min) && Number.isFinite(max) ? { min, max, minIndex, maxIndex } : null
}
