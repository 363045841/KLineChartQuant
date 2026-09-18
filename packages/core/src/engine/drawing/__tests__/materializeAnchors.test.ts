/** 验证创建期锚点物化：输入锚点补齐为全部持久化锚点。 */
import { describe, expect, it } from 'vitest'

import type { PersistedDrawingAnchor } from '../../../foundation/plugin'
import { getDrawingAnchorCount, materializeDrawingAnchors } from '../materializeAnchors'

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
  it('puts the parallel-channel second line on the first two bar times', () => {
    const anchors = materializeDrawingAnchors(
      'parallel-channel',
      [anchor('a', 500, 10), anchor('b', 1_000, 20), anchor('c', 1_500, 30)],
      createIdFactory(),
    )

    // 第三个输入点只提供价格：3 与次点同 X 且直接取该价格，2 与首点同 X 且按首两点增量反向回推。
    expect(anchors).toHaveLength(4)
    expect(anchors[2]).toMatchObject({ time: 500, price: 20 })
    expect(anchors[3]).toMatchObject({ time: 1_000, price: 30 })
  })

  it('copies the source future slot onto a derived anchor', () => {
    const anchors = materializeDrawingAnchors(
      'flat-line',
      [
        { ...anchor('a', 2_500, 10), futureOffset: 2 },
        anchor('b', 2_000, 20),
        anchor('c', 1_500, 30),
      ],
      createIdFactory(),
    )

    expect(anchors[2]).toMatchObject({ time: 2_500, futureOffset: 2, price: 30 })
    expect(anchors[3]).toMatchObject({ time: 2_000, price: 30 })
    expect(anchors[3]?.futureOffset).toBeUndefined()
  })

  it('derives both flat-line endpoints on the first two bar times', () => {
    const anchors = materializeDrawingAnchors(
      'flat-line',
      [anchor('a', 500, 10), anchor('b', 1_000, 20), anchor('c', 1_500, 30)],
      createIdFactory(),
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
    )

    // 第三个输入点只提供价格：2 与次点同 X，3 与首点同 X 且价格按首两点增量取反。
    expect(anchors).toHaveLength(4)
    expect(anchors[2]).toMatchObject({ time: 1_000, price: 20 })
    expect(anchors[3]).toMatchObject({ time: 500, price: 60 })
  })

  it('leaves drawings whose anchor count already matches untouched', () => {
    const anchors = [anchor('a', 500, 10), anchor('b', 1_000, 20)]
    expect(materializeDrawingAnchors('trend-line', anchors, createIdFactory())).toEqual(anchors)
  })

  it('reports four persisted anchors for the composite channels', () => {
    expect(getDrawingAnchorCount('parallel-channel')).toBe(4)
    expect(getDrawingAnchorCount('disjoint-channel')).toBe(4)
    expect(getDrawingAnchorCount('flat-line')).toBe(4)
    expect(getDrawingAnchorCount('trend-line')).toBe(2)
  })
})
