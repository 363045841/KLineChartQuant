/** 各 Pane 价格轴范围模式 localStorage 持久化回归测试。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PanePriceAxisModesSnapshot } from '../../engine/state/mainPriceAxisState'
import { PRICE_AXIS_RANGE_MODE } from '../../foundation/config/priceAxisRangeMode'
import { createMemoryKeyValueStorage } from '../../foundation/persistence/__tests__/_memoryKeyValueStorage'
import {
  createPanePriceAxisPersistence,
  loadStoredPanePriceAxisModes,
  PANE_PRICE_AXIS_MODES_STORAGE_KEY,
} from '../panePriceAxisPersistence'

describe('pane price axis persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads valid modes, drops unknown values and tolerates broken JSON', () => {
    const storage = createMemoryKeyValueStorage(
      JSON.stringify({ main: 'hand', MACD_0: 'auto', RSI_0: 'bogus' }),
    )

    expect(loadStoredPanePriceAxisModes(storage)).toEqual({ main: 'hand', MACD_0: 'auto' })

    storage.getItem.mockReturnValueOnce('{')
    expect(loadStoredPanePriceAxisModes(storage)).toBeNull()
  })

  it('coalesces writes for one second and flushes pending work on dispose', () => {
    const storage = createMemoryKeyValueStorage()
    let modes: PanePriceAxisModesSnapshot = { main: PRICE_AXIS_RANGE_MODE.AUTO }
    const persistence = createPanePriceAxisPersistence(() => modes, storage)

    persistence.schedule()
    persistence.schedule()
    vi.advanceTimersByTime(999)
    expect(storage.setItem).not.toHaveBeenCalled()

    modes = { main: PRICE_AXIS_RANGE_MODE.HAND, MACD_0: PRICE_AXIS_RANGE_MODE.HAND }
    vi.advanceTimersByTime(1)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(storage.setItem).toHaveBeenLastCalledWith(
      PANE_PRICE_AXIS_MODES_STORAGE_KEY,
      JSON.stringify(modes),
    )

    persistence.schedule()
    persistence.dispose()
    expect(storage.setItem).toHaveBeenCalledTimes(2)
  })
})
