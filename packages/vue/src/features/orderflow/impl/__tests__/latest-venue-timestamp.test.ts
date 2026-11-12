/** 交易所最新记录时刻：取深度、成交、持仓、分钟 CVD 里最新的一个，用于指认停摆。 */
import { describe, expect, it } from 'vitest'
import { latestVenueTimestamp } from '../parse-panel.js'

describe('latestVenueTimestamp', () => {
  it('在四类记录里取最新时刻', () => {
    const stamp = latestVenueTimestamp({
      depth: { timestamp: 300 },
      flows: [{ timestamp: 100 }, { timestamp: 500 }],
      positioning: { timestamp: 200 },
      cvd: [{ minuteStart: 100 }, { minuteStart: 700 }],
    })

    expect(stamp).toBe(700)
  })

  it('只有一部分记录时也能取到', () => {
    expect(latestVenueTimestamp({ flows: [{ timestamp: 42 }] })).toBe(42)
  })

  it('没有任何带时间的记录时为 null，不冒充新鲜', () => {
    expect(latestVenueTimestamp({ venue: 'okx', errors: [] })).toBeNull()
  })
})
