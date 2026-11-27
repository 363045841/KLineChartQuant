import type { KLineData } from '../../foundation/types/price.js'
import type { VisiblePriceExtrema } from '../../foundation/types/visiblePriceExtrema.js'
import type { VisibleRange } from './viewport.js'
import { findVisibleBarRange } from './visibleBarIndex.js'

export type { VisiblePriceExtrema } from '../../foundation/types/visiblePriceExtrema.js'

export function computeVisiblePriceExtrema(
  data: readonly KLineData[],
  range: VisibleRange,
  kLineCenters: readonly number[],
  scrollLeft: number,
  paneWidth: number,
  closeOnly = false,
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
    const high = closeOnly ? item.close : item.high
    const low = closeOnly ? item.close : item.low
    if (high >= max) {
      max = high
      maxIndex = index
    }
    if (low <= min) {
      min = low
      minIndex = index
    }
  }

  return Number.isFinite(min) && Number.isFinite(max) ? { min, max, minIndex, maxIndex } : null
}
