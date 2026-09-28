import { describe, expect, it } from 'vitest'
import { DataBuffer } from '../buffer/dataBuffer.js'

const bar = (timestamp: number) => ({ timestamp, open: 1, high: 1, low: 1, close: 1, volume: 1 })

describe('DataBuffer trading calendar', () => {
  it('按尾部锚点读取，并在新 K 线到达后消费槽位', () => {
    const buffer = new DataBuffer()
    buffer.setInlineData([bar(100)])
    expect(buffer.setTradingCalendar({ anchorTimestamp: 100, futureTimestamps: [200, 300] })).toBe(
      true,
    )
    expect(buffer.getFutureTimestamp(1)).toBe(200)
    buffer.applyRealtimeBars([bar(200)])
    expect(buffer.getFutureTimestamp(2)).toBe(300)
    buffer.applyRealtimeBars([bar(250)])
    expect(buffer.getFutureTimestamp(3)).toBeNull()
  })

  it('拒绝错误锚点及非递增日历；替换数据清空旧日历', () => {
    const buffer = new DataBuffer()
    buffer.setInlineData([bar(100)])
    expect(buffer.setTradingCalendar({ anchorTimestamp: 99, futureTimestamps: [200] })).toBe(false)
    expect(buffer.setTradingCalendar({ anchorTimestamp: 100, futureTimestamps: [200, 200] })).toBe(
      false,
    )
    expect(buffer.getFutureTimestamp(1)).toBeNull()
    buffer.setTradingCalendar({ anchorTimestamp: 100, futureTimestamps: [200] })
    buffer.setInlineData([bar(100)])
    expect(buffer.getFutureTimestamp(1)).toBeNull()
  })
})
