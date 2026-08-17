import { describe, it, expect } from 'vitest'
import { createDataState } from '../dataState'

describe('dataState', () => {
  it('applyActiveBufferSnapshot publishes key/data/loading atomically', () => {
    const m = createDataState()
    m.actions.applyActiveBufferSnapshot({
      key: 'old',
      data: [{ t: 1 }],
      loading: true,
      timeShareRange: null,
      timeSharePreClose: null,
    })

    const snaps: Array<{ key: string | null; len: number; loading: boolean }> = []
    const push = () => {
      snaps.push({
        key: m.readonly.activeBufferKey.peek(),
        len: m.readonly.data.peek().length,
        loading: m.readonly.loading.peek(),
      })
    }
    m.readonly.activeBufferKey.subscribe(push)
    m.readonly.data.subscribe(push)
    m.readonly.loading.subscribe(push)

    m.actions.applyActiveBufferSnapshot({
      key: 'main:A:daily',
      data: [{ t: 2 }, { t: 3 }],
      loading: false,
      timeShareRange: null,
      timeSharePreClose: null,
    })

    expect(m.readonly.activeBufferKey()).toBe('main:A:daily')
    expect(m.readonly.data()).toHaveLength(2)
    expect(m.readonly.loading()).toBe(false)
    for (const s of snaps) {
      expect(s).toEqual({ key: 'main:A:daily', len: 2, loading: false })
    }
  })

  it('reset clears activeBufferKey with other fields', () => {
    const m = createDataState()
    m.actions.applyActiveBufferSnapshot({
      key: 'main:A:daily',
      data: [{ t: 1 }],
      loading: true,
      timeShareRange: null,
      timeSharePreClose: null,
    })
    m.actions.reset()
    expect(m.readonly.activeBufferKey()).toBeNull()
    expect(m.readonly.data()).toEqual([])
    expect(m.readonly.loading()).toBe(false)
  })

  it('publishes timeshare metadata with the active buffer snapshot', () => {
    const m = createDataState()
    const range = {
      instrumentId: 'gotdx:stock:1:600519',
      timezone: 'Asia/Shanghai',
      requestedDays: 1,
      olderData: 'unknown' as const,
      days: [{ tradingDate: '2026-08-06' as const, preClose: 10, data: [] }],
    }

    m.actions.applyActiveBufferSnapshot({
      key: 'ts:gotdx:600519',
      data: [{ timestamp: 1 }],
      loading: false,
      timeShareRange: range,
      timeSharePreClose: 10,
    })

    expect(m.readonly.timeShareRange()).toBe(range)
    expect(m.readonly.timeSharePreClose()).toBe(10)
    expect(m.readonly.data()).toEqual([{ timestamp: 1 }])
  })
})
