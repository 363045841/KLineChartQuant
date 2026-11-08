/** KLineDataStore：唯一提交入口、稳定序号与实时尾段语义。 */
import { describe, expect, it } from 'vitest'
import { KLineDataStore } from '../buffer/impl/kLineDataStore'
import { DATA_CHANGE_KINDS } from '../buffer/types'

function bar(timestamp: number, close = 1, volume = 10) {
  return { timestamp, open: 1, high: 2, low: 0, close, volume }
}

describe('KLineDataStore', () => {
  it('replace 规范化顺序与重复时间戳，并把 origin 归零', () => {
    const store = new KLineDataStore()
    store.replace([bar(20, 2), bar(10, 1), bar(20, 5)])

    expect(store.getRawData().map((item) => [item.timestamp, item.close])).toEqual([
      [10, 1],
      [20, 5],
    ])
    expect(store.origin).toBe(0)
    expect(store.getOrdinalAtTimestamp(20)).toBe(1)
    expect(store.data()).toMatchObject({
      kind: DATA_CHANGE_KINDS.replace,
      start: 0,
      end: 2,
      origin: 0,
    })
  })

  it('prepend 只移动 origin，既有时间戳的序号不变', () => {
    const store = new KLineDataStore()
    store.replace([bar(20), bar(30)])
    const ordinalBefore = store.getOrdinalAtTimestamp(20)

    store.mergePage([bar(10)])

    expect(store.origin).toBe(-1)
    expect(store.getOrdinalAtTimestamp(20)).toBe(ordinalBefore)
    expect(store.getLogicalIndexAtTimestamp(20)).toBe(1)
    expect(store.data()).toMatchObject({
      kind: DATA_CHANGE_KINDS.prepend,
      start: 0,
      end: 1,
      origin: -1,
    })
  })

  it('append 保持 origin，只发布尾部区间', () => {
    const store = new KLineDataStore()
    store.replace([bar(10), bar(20)])

    store.mergePage([bar(30)])

    expect(store.origin).toBe(0)
    expect(store.data()).toMatchObject({
      kind: DATA_CHANGE_KINDS.append,
      start: 2,
      end: 3,
      origin: 0,
    })
  })

  it('分页命中既有时间戳时保留旧值且不发布', () => {
    const store = new KLineDataStore()
    store.replace([bar(20, 1), bar(30, 2)])
    const changes: number[] = []
    const unsubscribe = store.data.subscribe(() => changes.push(store.data().data.length))

    store.mergePage([bar(20, 9)])

    expect(store.getRawData().map((item) => item.close)).toEqual([1, 2])
    expect(changes).toEqual([])
    unsubscribe()
  })

  it('分页同时跨过首尾时拆成前置与后置两次提交', () => {
    const store = new KLineDataStore()
    store.replace([bar(20), bar(30)])
    const kinds: string[] = []
    const unsubscribe = store.data.subscribe(() => kinds.push(store.data().kind))

    store.mergePage([bar(10), bar(40)])

    expect(kinds).toEqual([DATA_CHANGE_KINDS.prepend, DATA_CHANGE_KINDS.append])
    expect(store.getRawData().map((item) => item.timestamp)).toEqual([10, 20, 30, 40])
    expect(store.data().origin).toBe(-1)
    unsubscribe()
  })

  it('分页插入既有区间内部时直接拒绝', () => {
    const store = new KLineDataStore()
    store.replace([bar(10, 1), bar(30, 3)])

    expect(() => store.mergePage([bar(20, 2)])).toThrow('分页不能插入既有序列内部')
  })

  it('实时尾段替换 forming bar、追加新根并拒绝陈旧帧', () => {
    const store = new KLineDataStore()
    store.replace([bar(10), bar(20), bar(30)])

    const result = store.applyRealtime([bar(20, 9), bar(30, 8), bar(40, 7), bar(10, 0)])

    expect(result).toMatchObject({ appendedCount: 1, replacedCount: 2 })
    expect(result.rejected).toEqual([bar(10, 0)])
    expect(store.getRawData().map((item) => [item.timestamp, item.close])).toEqual([
      [10, 1],
      [20, 9],
      [30, 8],
      [40, 7],
    ])
    expect(store.data()).toMatchObject({
      kind: DATA_CHANGE_KINDS.tail,
      start: 1,
      end: 4,
      origin: 0,
    })
  })

  it('实时帧没有实际变化时也发布一次原子快照', () => {
    const store = new KLineDataStore()
    store.replace([bar(10), bar(20)])
    const changes: number[] = []
    const unsubscribe = store.data.subscribe(() => changes.push(store.data().data.length))

    const result = store.applyRealtime([bar(20)])

    expect(result).toMatchObject({ appendedCount: 0, replacedCount: 1 })
    expect(changes).toEqual([2])
    unsubscribe()
  })

  it('correct 只改一根，origin 与序号不变', () => {
    const store = new KLineDataStore()
    store.replace([bar(10), bar(20), bar(30)])
    const ordinalBefore = store.getOrdinalAtTimestamp(20)

    store.correct(bar(20, 9))

    expect(store.getRawData().map((item) => item.close)).toEqual([1, 9, 1])
    expect(store.getOrdinalAtTimestamp(20)).toBe(ordinalBefore)
    expect(store.data()).toMatchObject({
      kind: DATA_CHANGE_KINDS.correct,
      start: 1,
      end: 2,
    })
  })

  it('loadedTimeRange 跟随当前序列，replace 会收缩', () => {
    const store = new KLineDataStore()
    store.replace([bar(10), bar(20)])
    store.mergePage([bar(5)])
    store.mergePage([bar(30)])

    expect(store.loadedTimeRange).toEqual({ earliestTs: 5, latestTs: 30 })

    store.replace([bar(20)])
    expect(store.loadedTimeRange).toEqual({ earliestTs: 20, latestTs: 20 })
  })
})
