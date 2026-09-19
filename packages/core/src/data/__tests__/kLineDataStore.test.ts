/** KLineDataStore.updateBars 语义测试：replace-on-conflict 末尾窗口合并，拒绝陈旧帧。 */
import { describe, expect, it } from 'vitest'

import { KLineDataStore } from '../buffer/kLineDataStore'

function bar(timestamp: number, close = 1, volume = 10) {
  return { timestamp, open: 1, high: 2, low: 0, close, volume }
}

describe('KLineDataStore.updateBars', () => {
  it('appends bars newer than the last bar', () => {
    const store = new KLineDataStore()
    store.setInlineData([bar(10), bar(20)])

    const result = store.updateBars([bar(30, 5)])

    expect(result.appendedCount).toBe(1)
    expect(result.replacedCount).toBe(0)
    expect(result.rejected).toEqual([])
    expect(store.getRawData().map((item) => item.close)).toEqual([1, 1, 5])
  })

  it('replaces a forming bar with the same timestamp instead of dropping it', () => {
    const store = new KLineDataStore()
    store.setInlineData([bar(10), bar(20, 1)])

    const result = store.updateBars([bar(20, 9)])

    expect(result.appendedCount).toBe(0)
    expect(result.replacedCount).toBe(1)
    expect(store.getRawData().map((item) => item.close)).toEqual([1, 9])
    // 关键回归防线：forming 更新不会被 merge 的保旧弃新吞掉
    expect(store.getRawData()).toHaveLength(2)
  })

  it('allows revising the last two bars but rejects older stale frames', () => {
    const store = new KLineDataStore()
    store.setInlineData([bar(10), bar(20), bar(30), bar(40)])

    // 倒数第二根可修订
    const revised = store.updateBars([bar(30, 8)])
    expect(revised.replacedCount).toBe(1)
    expect(revised.rejected).toEqual([])

    // 早于末尾两根窗口的帧被拒绝：数据不变
    const stale = store.updateBars([bar(20, 7)])
    expect(stale.rejected).toEqual([bar(20, 7)])
    expect(stale.appendedCount).toBe(0)
    expect(stale.replacedCount).toBe(0)
    expect(store.getRawData().map((item) => item.close)).toEqual([1, 1, 8, 1])
  })

  it('does not publish a data change when every incoming frame is stale', () => {
    const store = new KLineDataStore()
    store.setInlineData([bar(10), bar(20), bar(30)])
    const changes: number[] = []
    const unsubscribe = store.data.subscribe(() => changes.push(store.data().data.length))

    store.updateBars([bar(10, 9)])

    expect(changes).toEqual([])
    unsubscribe()
  })

  it('applies closed plus forming as one atomic write with a single signal', () => {
    const store = new KLineDataStore()
    store.setInlineData([bar(10), bar(20, 1)])
    const changes: string[] = []
    const unsubscribe = store.data.subscribe(() =>
      changes.push(store.data().data.map((item) => item.close).join(',')),
    )

    // 收线 + 新 forming 一次写入（SSE 帧序列的典型批）
    const result = store.updateBars([bar(20, 2), bar(30, 3)])

    expect(changes).toEqual(['1,2,3'])
    expect(result.appendedCount).toBe(1)
    expect(result.replacedCount).toBe(1)
    expect(store.data().prependedCount).toBe(0)
    unsubscribe()
  })

  it('seeds all bars into an empty store and keeps the last write for batch duplicates', () => {
    const store = new KLineDataStore()

    const result = store.updateBars([bar(10, 1), bar(20, 2), bar(20, 5)])

    expect(result.appendedCount).toBe(2)
    expect(store.getRawData().map((item) => item.close)).toEqual([1, 5])
  })

  it('mixes stale rejection with accepted tail updates in one batch', () => {
    const store = new KLineDataStore()
    store.setInlineData([bar(10), bar(20), bar(30, 1)])

    const result = store.updateBars([bar(10, 9), bar(30, 4), bar(40, 5)])

    expect(result.rejected).toEqual([bar(10, 9)])
    expect(result.replacedCount).toBe(1)
    expect(result.appendedCount).toBe(1)
    expect(store.getRawData().map((item) => item.close)).toEqual([1, 1, 4, 5])
  })

  it('keeps loadedTimeRange growing with appended realtime bars', () => {
    const store = new KLineDataStore()
    store.setInlineData([bar(10), bar(20)])

    store.updateBars([bar(30)])

    expect(store.loadedTimeRange).toEqual({ earliestTs: 10, latestTs: 30 })
  })
})
