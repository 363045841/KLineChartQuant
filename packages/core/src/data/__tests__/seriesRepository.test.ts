/** SeriesRepository 单元测试：验证序列身份隔离、拓扑通知和 Buffer 生命周期。 */
import { describe, expect, it, vi } from 'vitest'
import { makeSymbolSpec } from '@/engine/data/__tests__/helpers/symbolSpecFixture'
import { DataBuffer } from '../buffer/impl/dataBuffer'
import {
  type BarsSelection,
  instrumentKeyFromSpec,
  SERIES_SELECTION_KIND,
  SeriesRepository,
  sourceFromSpec,
  type TimeShareSelection,
} from '../buffer/impl/seriesRepository'
import { TimeShareBuffer } from '../buffer/impl/timeShareBuffer'
import { OLDER_DATA_STATUS } from '../provider/types'

/** 创建测试用 K 线选择。 */
function barsSelection(overrides: Partial<BarsSelection> = {}): BarsSelection {
  return {
    kind: SERIES_SELECTION_KIND.bars,
    instrumentKey: '["CN","SH","600000"]',
    source: 'gotdx',
    period: 'daily',
    adjustment: 'none',
    barAggregation: 'original',
    ...overrides,
  }
}

/** 创建测试用分时选择。 */
function timeShareSelection(overrides: Partial<TimeShareSelection> = {}): TimeShareSelection {
  return {
    kind: SERIES_SELECTION_KIND.timeShare,
    instrumentKey: '["CN","SH","600000"]',
    source: 'gotdx',
    tradingDate: 'latest',
    ...overrides,
  }
}

describe('SeriesRepository', () => {
  it('derives instrument identity from the instrument session, exchange and code', () => {
    const left = makeSymbolSpec({ symbol: '600000', market: 'cn', exchange: 'sh', source: 'gotdx' })
    const right = makeSymbolSpec({
      symbol: '600000',
      market: 'CN',
      exchange: 'SH',
      source: 'baostock',
    })

    expect(instrumentKeyFromSpec(left)).toBe(instrumentKeyFromSpec(right))
    expect(
      instrumentKeyFromSpec(makeSymbolSpec({ symbol: '600000', market: 'HK', exchange: 'HKEX' })),
    ).not.toBe(instrumentKeyFromSpec(left))
    expect(sourceFromSpec(right)).toBe('baostock')
  })

  it('returns one Buffer for the same identity and isolates source, period and adjustment', () => {
    const repository = new SeriesRepository()
    const daily = repository.getOrCreateBars(barsSelection(), () => new DataBuffer())

    expect(repository.getOrCreateBars(barsSelection(), () => new DataBuffer())).toBe(daily)
    expect(
      repository.getOrCreateBars(barsSelection({ source: 'baostock' }), () => new DataBuffer()),
    ).not.toBe(daily)
    expect(
      repository.getOrCreateBars(barsSelection({ period: 'weekly' }), () => new DataBuffer()),
    ).not.toBe(daily)
    expect(
      repository.getOrCreateBars(barsSelection({ adjustment: 'qfq' }), () => new DataBuffer()),
    ).not.toBe(daily)
  })

  it('isolates time-share data by trading date', () => {
    const repository = new SeriesRepository()
    const latest = repository.getOrCreateTimeShare(
      timeShareSelection(),
      () => new TimeShareBuffer(),
    )
    const historical = repository.getOrCreateTimeShare(
      timeShareSelection({ tradingDate: '2026-08-18' }),
      () => new TimeShareBuffer(),
    )

    expect(historical).not.toBe(latest)
    expect(repository.getTimeShare(timeShareSelection())).toBe(latest)
  })

  it('publishes topology only when leaves are added or removed', () => {
    const repository = new SeriesRepository()
    const listener = vi.fn()
    repository.snapshot.subscribe(listener)
    const selection = barsSelection()
    const buffer = repository.getOrCreateBars(selection, () => new DataBuffer())

    buffer.replace([], OLDER_DATA_STATUS.EXHAUSTED, null)
    repository.getOrCreateBars(selection, () => new DataBuffer())
    expect(listener).toHaveBeenCalledTimes(1)

    repository.delete(selection)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('disposes each Buffer once and rejects registration after disposal', () => {
    const repository = new SeriesRepository()
    const buffer = new DataBuffer()
    const dispose = vi.spyOn(buffer, 'dispose')
    repository.getOrCreateBars(barsSelection(), () => buffer)

    repository.dispose()
    repository.dispose()

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(() => repository.getOrCreateBars(barsSelection(), () => new DataBuffer())).toThrow(
      'repository is disposed',
    )
  })
})
