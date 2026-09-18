/** 验证创建期锚点物化：输入锚点补齐为全部持久化锚点。 */
import { describe, expect, it } from 'vitest'

import type { PersistedDrawingAnchor } from '../../../foundation/plugin'
import { getDrawingAnchorCount, materializeDrawingAnchors } from '../materializeAnchors'
import { createDrawingViewportPort } from './helpers/drawingTestKit'

/** 五个 Bar 的时间轴，覆盖派生出与越界记未来槽位两种情形。 */
const TIMESTAMPS = [500, 1_000, 1_500, 2_000, 2_500]

/** 时间轴夹具：时间戳与逻辑索引一一对应。 */
const timeline = createDrawingViewportPort({
  getDrawingData: () => TIMESTAMPS.map((timestamp) => ({ timestamp })),
  getDrawingTimestampAtLogicalIndex: (index) => TIMESTAMPS[index] ?? null,
  getLogicalIndexAtTimestamp: (timestamp) => {
    const index = TIMESTAMPS.indexOf(timestamp)
    return index >= 0 ? index : null
  },
})

/** 按时间戳与价格构造输入锚点，只声明用例关心的字段。 */
function anchor(id: string, time: number, price: number): PersistedDrawingAnchor {
  return { id, type: 'point', time, price }
}

/** 生成递增的派生锚点 id。 */
function createIdFactory(): () => string {
  let next = 0
  return () => `derived-${next++}`
}

describe('materializeDrawingAnchors', () => {
  it('appends the translated fourth anchor of a parallel channel', () => {
    const anchors = materializeDrawingAnchors(
      'parallel-channel',
      [anchor('a', 500, 10), anchor('b', 1_000, 20), anchor('c', 1_500, 30)],
      createIdFactory(),
      timeline,
    )

    expect(anchors).toHaveLength(4)
    expect(anchors[3]).toMatchObject({ time: 2_000, price: 40 })
    expect(anchors[3]?.futureOffset).toBeUndefined()
  })

  it('records a future slot when the derived anchor passes the last bar', () => {
    const anchors = materializeDrawingAnchors(
      'parallel-channel',
      [anchor('a', 1_500, 10), anchor('b', 2_000, 20), anchor('c', 2_500, 30)],
      createIdFactory(),
      timeline,
    )

    expect(anchors[3]).toMatchObject({ time: 2_500, futureOffset: 1, price: 40 })
  })

  it('derives both flat-line endpoints on the first two bar times', () => {
    const anchors = materializeDrawingAnchors(
      'flat-line',
      [anchor('a', 500, 10), anchor('b', 1_000, 20), anchor('c', 1_500, 30)],
      createIdFactory(),
      timeline,
    )

    expect(anchors).toHaveLength(4)
    expect(anchors[2]).toMatchObject({ time: 500, price: 30 })
    expect(anchors[3]).toMatchObject({ time: 1_000, price: 30 })
  })

  it('derives the mirrored disjoint-channel line on the first two bar times', () => {
    const anchors = materializeDrawingAnchors(
      'disjoint-channel',
      [anchor('a', 500, 100), anchor('b', 1_000, 140), anchor('c', 1_500, 20)],
      createIdFactory(),
      timeline,
    )

    // 第三个输入点只提供价格：2 与次点同 X，3 与首点同 X 且价格按首两点增量取反。
    expect(anchors).toHaveLength(4)
    expect(anchors[2]).toMatchObject({ time: 1_000, price: 20 })
    expect(anchors[3]).toMatchObject({ time: 500, price: 60 })
  })

  it('rejects a derived anchor that falls before the first bar', () => {
    expect(() =>
      materializeDrawingAnchors(
        'parallel-channel',
        [anchor('a', 1_500, 10), anchor('b', 1_000, 20), anchor('c', 500, 30)],
        createIdFactory(),
        timeline,
      ),
    ).toThrowError(/outside the drawable range/)
  })

  it('leaves drawings whose anchor count already matches untouched', () => {
    const anchors = [anchor('a', 500, 10), anchor('b', 1_000, 20)]
    expect(materializeDrawingAnchors('trend-line', anchors, createIdFactory(), timeline)).toEqual(
      anchors,
    )
  })

  it('reports four persisted anchors for the composite channels', () => {
    expect(getDrawingAnchorCount('parallel-channel')).toBe(4)
    expect(getDrawingAnchorCount('disjoint-channel')).toBe(4)
    expect(getDrawingAnchorCount('flat-line')).toBe(4)
    expect(getDrawingAnchorCount('trend-line')).toBe(2)
  })
})
