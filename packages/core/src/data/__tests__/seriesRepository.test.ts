/** SeriesRepository 单元测试：验证序列身份隔离、拓扑通知和 Buffer 生命周期。 */
import { describe, expect, it, vi } from 'vitest'

import { DataBuffer } from '../buffer/dataBuffer'
import {
  SeriesRepository,
  instrumentKeyFromSpec,
  sourceIdFromSpec,
  type SeriesSelection,
} from '../buffer/seriesRepository'
import { TimeShareBuffer } from '../buffer/timeShareBuffer'

/** 创建测试用 K 线选择。 */
function barsSelection(
  overrides: Partial<Extract<SeriesSelection, { kind: 'bars' }>> = {},
): Extract<SeriesSelection, { kind: 'bars' }> {
  return {
    kind: 'bars',
    instrumentKey: '["CN","SH","600000"]',
    sourceId: 'gotdx',
    period: 'daily',
    adjustment: 'none',
    ...overrides,
  }
}

/** 创建测试用分时选择。 */
function timeShareSelection(
  overrides: Partial<Extract<SeriesSelection, { kind: 'timeShare' }>> = {},
): Extract<SeriesSelection, { kind: 'timeShare' }> {
  return {
    kind: 'timeShare',
    instrumentKey: '["CN","SH","600000"]',
    sourceId: 'gotdx',
    tradingDate: 'latest',
    ...overrides,
  }
}

describe('SeriesRepository', () => {
  it('normalizes market identity without including source-private parameters', () => {
    const left = instrumentKeyFromSpec({
      market: ' cn ',
      exchange: 'sh',
      symbol: '600000',
      source: 'gotdx',
      params: { market: 1 },
    })
    const right = instrumentKeyFromSpec({
      market: 'CN',
      exchange: 'SH',
      symbol: '600000',
      source: 'baostock',
      params: { providerCode: 'sh.600000' },
    })

    expect(left).toBe(right)
    expect(instrumentKeyFromSpec({ market: 'HK', exchange: 'HKEX', symbol: '600000' })).not.toBe(
      left,
    )
    expect(sourceIdFromSpec({ market: 'CN', symbol: '600000' })).toBe('auto')
  })

  it('returns one Buffer for the same identity and isolates source, period and adjustment', () => {
    const repository = new SeriesRepository()
    const daily = repository.getOrCreateBars(barsSelection(), () => new DataBuffer())

    expect(repository.getOrCreateBars(barsSelection(), () => new DataBuffer())).toBe(daily)
    expect(
      repository.getOrCreateBars(barsSelection({ sourceId: 'baostock' }), () => new DataBuffer()),
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

    buffer.setInlineData([])
    repository.getOrCreateBars(selection, () => new DataBuffer())
    expect(listener).toHaveBeenCalledTimes(1)

    repository.delete(selection)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('moves an auto leaf to its resolved source in one topology update', () => {
    const repository = new SeriesRepository()
    const selection = barsSelection({ sourceId: 'auto' })
    const buffer = repository.getOrCreateBars(selection, () => new DataBuffer())
    const listener = vi.fn()
    repository.snapshot.subscribe(listener)

    const resolved = repository.moveToSource(selection, 'gotdx')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(repository.getBars(selection)).toBeUndefined()
    expect(
      repository.getBars(resolved.selection as Extract<SeriesSelection, { kind: 'bars' }>),
    ).toBe(buffer)
    expect(() => (repository.snapshot.peek() as Map<string, unknown>).clear()).toThrow('immutable')
  })

  it('adopts an existing resolved-source leaf and disposes the duplicate auto Buffer', () => {
    const repository = new SeriesRepository()
    const resolvedSelection = barsSelection({ sourceId: 'gotdx' })
    const autoSelection = barsSelection({ sourceId: 'auto' })
    const existing = repository.getOrCreateBars(resolvedSelection, () => new DataBuffer())
    const duplicate = repository.getOrCreateBars(autoSelection, () => new DataBuffer())
    const dispose = vi.spyOn(duplicate, 'dispose')

    const result = repository.moveToSource(autoSelection, 'gotdx')

    expect(result).toEqual({ selection: resolvedSelection, buffer: existing, moved: false })
    expect(dispose).toHaveBeenCalledOnce()
    expect(repository.getBars(autoSelection)).toBeUndefined()
  })

  it('resolves the same collision policy for time-share leaves', () => {
    const repository = new SeriesRepository()
    const resolvedSelection = timeShareSelection({ sourceId: 'gotdx' })
    const autoSelection = timeShareSelection({ sourceId: 'auto' })
    const existing = repository.getOrCreateTimeShare(resolvedSelection, () => new TimeShareBuffer())
    const duplicate = repository.getOrCreateTimeShare(autoSelection, () => new TimeShareBuffer())
    const dispose = vi.spyOn(duplicate, 'dispose')

    const result = repository.moveToSource(autoSelection, 'gotdx')

    expect(result.buffer).toBe(existing)
    expect(result.moved).toBe(false)
    expect(dispose).toHaveBeenCalledOnce()
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
