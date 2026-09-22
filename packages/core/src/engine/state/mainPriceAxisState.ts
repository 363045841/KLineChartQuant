/** 主图价格轴视图状态：手动范围是唯一可写范围状态。 */

import {
  PRICE_AXIS_RANGE_MODE,
  type PriceAxisRangeMode,
} from '../../foundation/config/priceAxisRangeMode.js'
import { createSubState } from '../../foundation/reactivity/signal.js'
import type { PriceRange } from '../scale/price.js'

function snapshotRange(range: PriceRange): PriceRange {
  return Object.freeze({ minPrice: range.minPrice, maxPrice: range.maxPrice })
}

export function createMainPriceAxisState(initialMode: PriceAxisRangeMode) {
  const { signals, readonly } = createSubState({
    rangeMode: initialMode,
    handRange: null as PriceRange | null,
  })

  return {
    readonly,
    actions: {
      useAutoRange(): void {
        signals.rangeMode.set(PRICE_AXIS_RANGE_MODE.AUTO)
        signals.handRange.set(null)
      },
      useHandRange(range: PriceRange): void {
        signals.handRange.set(snapshotRange(range))
        signals.rangeMode.set(PRICE_AXIS_RANGE_MODE.HAND)
      },
      setHandRange(range: PriceRange): void {
        if (signals.rangeMode.peek() !== PRICE_AXIS_RANGE_MODE.HAND) return
        signals.handRange.set(snapshotRange(range))
      },
      initializeHandRange(range: PriceRange): void {
        if (
          signals.rangeMode.peek() !== PRICE_AXIS_RANGE_MODE.HAND ||
          signals.handRange.peek() !== null
        ) {
          return
        }
        signals.handRange.set(snapshotRange(range))
      },
    },
  }
}

export type MainPriceAxisStateModule = ReturnType<typeof createMainPriceAxisState>
