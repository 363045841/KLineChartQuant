/** 柱体屏幕投影：视口裁剪、屏幕缓冲复用与物理像素量化。 */
import { describe, expect, it } from 'vitest'
import { projectBarPrimitives } from '../impl/paintBars.js'
import type { WorldRectBatch } from '../types.js'

/** 生成等宽柱：第 i 根从 x = i × step、宽 6、高 10、y = 2 开始。 */
function makeBatch(count: number, step = 8): WorldRectBatch {
  const buf = new Float64Array(count * 4)
  for (let index = 0; index < count; index += 1) buf.set([index * step, 2, 6, 10], index * 4)
  return { buf, count, color: '#f00' }
}

describe('柱体屏幕投影', () => {
  it('复用世界缓冲对应的屏幕缓冲与原语对象', () => {
    const batch = makeBatch(10)
    const first = projectBarPrimitives([batch], 0, 1, 800)[0]!
    const second = projectBarPrimitives([batch], 8, 1, 800)[0]!
    expect(second).toBe(first)
    expect(second.data.buffer).toBe(first.data.buffer)
  })

  it('只写与视口相交的柱，两端各保留部分可见的柱', () => {
    const batch = makeBatch(200)
    const [visible] = projectBarPrimitives([batch], 1, 1, 100)
    // 视口 0..100：x=-1（右边界 5）与 x=95（右边界 101）都相交，x=103 在视口外。
    expect(visible?.data.length).toBe(13 * 4)
    expect(Array.from(visible!.data.slice(0, 4))).toEqual([-1, 2, 6, 10])
    expect(Array.from(visible!.data.slice(-4))).toEqual([95, 2, 6, 10])
  })

  it('视口外的批次不提交，可见柱数变化时复用同一块缓冲', () => {
    const batch = makeBatch(20)
    expect(projectBarPrimitives([batch], -1000, 1, 100)).toEqual([])
    const shrunk = projectBarPrimitives([{ ...batch, count: 2 }], 0, 1, 800)[0]!
    expect(shrunk.data.length).toBe(2 * 4)
    expect(shrunk.data.buffer).toBe(projectBarPrimitives([batch], 0, 1, 800)[0]!.data.buffer)
  })

  it('可见柱仍按物理像素量化', () => {
    const [visible] = projectBarPrimitives([makeBatch(2)], 0.5, 1.5, 800)
    expect(Array.from(visible!.data)).toEqual([-1 / 1.5, 2, 6, 10, 11 / 1.5, 2, 6, 10])
  })
})
