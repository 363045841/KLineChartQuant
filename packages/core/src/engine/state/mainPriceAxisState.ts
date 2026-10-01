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
      /** 清除手动范围，保留模式偏好，由下一帧按可见行情重新初始化。 */
      resetHandRange(): void {
        signals.handRange.set(null)
      },
      useAutoRange(): void {
        signals.rangeMode.set(PRICE_AXIS_RANGE_MODE.AUTO)
        signals.handRange.set(null)
      },
      useHandRange(range: PriceRange): void {
        signals.handRange.set(snapshotRange(range))
        signals.rangeMode.set(PRICE_AXIS_RANGE_MODE.HAND)
      },
      setHandRange(range: PriceRange): void {
        // null 表示新品种尚未初始化；交互只能修改已有范围，不能代替首帧初始化。
        if (
          signals.rangeMode.peek() !== PRICE_AXIS_RANGE_MODE.HAND ||
          signals.handRange.peek() === null
        )
          return
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
