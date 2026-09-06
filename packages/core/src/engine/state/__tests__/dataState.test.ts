/** dataState 单元测试：验证活动选择和强类型业务快照原子发布。 */
import { describe, expect, it } from 'vitest'

import type { SeriesSelection } from '../../../data/buffer/seriesRepository'
import { createDataState } from '../dataState'

const barsSelection: Extract<SeriesSelection, { kind: 'bars' }> = {
  kind: 'bars',
  instrumentKey: '["CN","SH","600000"]',
  sourceId: 'gotdx',
  period: 'daily',
  adjustment: 'none',
}

describe('dataState', () => {
  it('publishes selection, data and loading atomically', () => {
    const state = createDataState()
    const snapshots: Array<{
      selection: SeriesSelection | null
      length: number
      loading: boolean
    }> = []
    const record = () => {
      snapshots.push({
        selection: state.readonly.activeSelection.peek(),
        length: state.readonly.data.peek().length,
        loading: state.readonly.loading.peek(),
      })
    }
    state.readonly.activeSelection.subscribe(record)
    state.readonly.data.subscribe(record)
    state.readonly.loading.subscribe(record)

    state.actions.applyActiveBufferSnapshot({
      kind: 'bars',
      selection: barsSelection,
      data: [{ timestamp: 1, open: 1, high: 1, low: 1, close: 1 }],
      loading: true,
      error: null,
      timezone: 'UTC',
      timeShareRange: null,
      timeSharePreClose: null,
    })

    expect(state.readonly.activeSelection()).toBe(barsSelection)
    expect(state.readonly.data()).toHaveLength(1)
    expect(state.readonly.loading()).toBe(true)
    expect(state.readonly.dataRevision()).toBe(1)
    for (const snapshot of snapshots) {
      expect(snapshot).toEqual({ selection: barsSelection, length: 1, loading: true })
    }
  })

  it('only advances dataRevision when the active selection or data changes', () => {
    const state = createDataState()
    const data = [{ timestamp: 1, open: 1, high: 1, low: 1, close: 1 }]
    state.actions.applyActiveBufferSnapshot({
      kind: 'bars', selection: barsSelection, data, loading: true, error: null, timezone: 'UTC',
      timeShareRange: null, timeSharePreClose: null,
    })
    state.actions.applyActiveBufferSnapshot({
      kind: 'bars', selection: barsSelection, data, loading: false, error: null, timezone: 'UTC',
      timeShareRange: null, timeSharePreClose: null,
    })
    expect(state.readonly.dataRevision()).toBe(1)

    state.actions.applyActiveBufferSnapshot({
      kind: 'bars', selection: barsSelection, data: [...data], loading: false, error: null, timezone: 'UTC',
      timeShareRange: null, timeSharePreClose: null,
    })
    expect(state.readonly.dataRevision()).toBe(2)
  })

  it('reset clears the complete active snapshot', () => {
    const state = createDataState()
    state.actions.applyActiveBufferSnapshot({
      kind: 'bars',
      selection: barsSelection,
      data: [],
      loading: true,
      error: 'failed',
      timezone: 'UTC',
      timeShareRange: null,
      timeSharePreClose: null,
    })

    state.actions.reset()

    expect(state.readonly.activeSelection()).toBeNull()
    expect(state.readonly.data()).toEqual([])
    expect(state.readonly.loading()).toBe(false)
    expect(state.readonly.error()).toBeNull()
  })

  it('publishes time-share metadata with its discriminated snapshot', () => {
    const state = createDataState()
    const range = {
      instrumentId: 'gotdx:stock:1:600519',
      timezone: 'Asia/Shanghai',
      requestedDays: 1,
      olderData: 'unknown' as const,
      days: [{ tradingDate: '2026-08-06' as const, preClose: 10, data: [] }],
    }
    const selection: Extract<SeriesSelection, { kind: 'timeShare' }> = {
      kind: 'timeShare',
      instrumentKey: '["CN","SH","600519"]',
      sourceId: 'gotdx',
      tradingDate: '2026-08-06',
    }

    state.actions.applyActiveBufferSnapshot({
      kind: 'timeShare',
      selection,
      data: [{ timestamp: 1, price: 10, average: 10 }],
      loading: false,
      error: null,
      timezone: range.timezone,
      timeShareRange: range,
      timeSharePreClose: 10,
    })

    expect(state.readonly.timeShareRange()).toBe(range)
    expect(state.readonly.timeSharePreClose()).toBe(10)
    expect(state.readonly.activeSelection()).toBe(selection)
  })
})
