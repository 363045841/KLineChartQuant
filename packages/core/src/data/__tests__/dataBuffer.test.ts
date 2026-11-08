/** DataBuffer：分页合并、稳定序号、实时尾段与状态发布。 */
import { describe, expect, it } from 'vitest'

import { DataBuffer } from '../buffer/impl/dataBuffer'
import { OLDER_DATA_STATUS } from '../provider/types'

function bar(timestamp: number, close = 1) {
  return { timestamp, open: 1, high: 2, low: 0, close, volume: 10 }
}

describe('DataBuffer', () => {
  it('setSymbol 清空快照与序号', () => {
    const buffer = new DataBuffer()
    buffer.replace([bar(1)], OLDER_DATA_STATUS.EXHAUSTED, null)
    buffer.mergePage([bar(0)], OLDER_DATA_STATUS.AVAILABLE, 'UTC')
    expect(buffer.data().origin).toBe(-1)

    buffer.setSymbol({ symbol: 'BTCUSDT', market: 'crypto', period: 'daily', source: 'test' })

    expect(buffer.getRawData()).toEqual([])
    expect(buffer.data().origin).toBe(0)
    expect(buffer.loading()).toBe(false)
  })

  it('mergePage 发布前置区间并保持既有序号', () => {
    const buffer = new DataBuffer()
    buffer.replace([bar(20), bar(30)], OLDER_DATA_STATUS.EXHAUSTED, null)
    const ordinalBefore = buffer.getOrdinalAtTimestamp(20)
    const changes: Array<[string, number, number]> = []
    const unsubscribe = buffer.data.subscribe(() => {
      const change = buffer.data()
      changes.push([change.kind, change.start, change.end])
    })

    buffer.mergePage([bar(10)], OLDER_DATA_STATUS.AVAILABLE, 'UTC')

    expect(buffer.getRawData().map((item) => item.timestamp)).toEqual([10, 20, 30])
    expect(buffer.getOrdinalAtTimestamp(20)).toBe(ordinalBefore)
    expect(changes).toEqual([['prepend', 0, 1]])
    unsubscribe()
  })

  it('prepend 后逻辑下标随 origin 平移', () => {
    const buffer = new DataBuffer()
    buffer.replace([bar(20), bar(30)], OLDER_DATA_STATUS.EXHAUSTED, null)

    buffer.mergePage([bar(10)], OLDER_DATA_STATUS.AVAILABLE, 'UTC')

    expect(buffer.getLogicalIndexAtTimestamp(10)).toBe(0)
    expect(buffer.getLogicalIndexAtTimestamp(20)).toBe(1)
    expect(buffer.getLogicalIndexAtTimestamp(30)).toBe(2)
    expect(buffer.getLogicalIndexAtTimestamp(99)).toBeNull()
  })

  it('重复时间戳按后写生效并保持索引唯一', () => {
    const buffer = new DataBuffer()
    buffer.replace([bar(20, 1), bar(20, 5)], OLDER_DATA_STATUS.EXHAUSTED, null)

    expect(buffer.getRawData().map((item) => item.close)).toEqual([5])
    expect(buffer.getLogicalIndexAtTimestamp(20)).toBe(0)
  })

  it('发布加载与错误状态', () => {
    const buffer = new DataBuffer()
    buffer.setLoading(true)
    buffer.setError('upstream unavailable')

    expect(buffer.loading()).toBe(false)
    expect(buffer.lastError()).toBe('upstream unavailable')

    buffer.mergePage([bar(1)], OLDER_DATA_STATUS.AVAILABLE, 'UTC')
    expect(buffer.lastError()).toBeNull()
  })

  it('保留来源时区，不推导展示日历', () => {
    const buffer = new DataBuffer()
    buffer.mergePage(
      [bar(Date.UTC(2026, 0, 1)), bar(Date.UTC(2026, 1, 1))],
      OLDER_DATA_STATUS.AVAILABLE,
      'America/New_York',
    )

    expect(buffer.timezone).toBe('America/New_York')
  })

  it('原子替换 forming bar 并追加下一根', () => {
    const buffer = new DataBuffer()
    buffer.replace([bar(10), bar(20)], OLDER_DATA_STATUS.EXHAUSTED, null)
    const changes: number[] = []
    const unsubscribe = buffer.data.subscribe(() => changes.push(buffer.data().data.length))

    const result = buffer.applyRealtimeBars([
      { ...bar(20), close: 3 },
      { ...bar(30), close: 4 },
    ])

    expect(buffer.getRawData().map((item) => [item.timestamp, item.close])).toEqual([
      [10, 1],
      [20, 3],
      [30, 4],
    ])
    expect(result).toMatchObject({ appendedCount: 1, replacedCount: 1, rejected: [] })
    expect(changes).toEqual([3])
    unsubscribe()
  })
})
