/** 验证拖拽策略把被拖锚点解析为要一起移动的锚点及其位移系数。 */
import { describe, expect, it } from 'vitest'

import { resolveAnchorFollowers, resolveLineHandle } from '../impl/dragPolicy'

describe('resolveAnchorFollowers', () => {
  it.each([
    { index: 0, moving: [{ index: 0 }, { index: 2 }] },
    { index: 1, moving: [{ index: 1 }, { index: 3 }] },
    { index: 2, moving: [{ index: 0 }, { index: 2 }] },
    { index: 3, moving: [{ index: 1 }, { index: 3 }] },
  ])('pairs the parallel-channel role of anchor $index', ({ index, moving }) => {
    expect(resolveAnchorFollowers('parallel-channel', index)).toEqual(moving)
  })

  it.each([
    { index: 0, moving: [{ index: 0 }, { index: 2, follow: { time: 1, price: 0 } }] },
    { index: 1, moving: [{ index: 1 }, { index: 3, follow: { time: 1, price: 0 } }] },
    {
      index: 2,
      moving: [
        { index: 2 },
        { index: 0, follow: { time: 1, price: 0 } },
        { index: 3, follow: { time: 0, price: 1 } },
      ],
    },
    {
      index: 3,
      moving: [
        { index: 3 },
        { index: 1, follow: { time: 1, price: 0 } },
        { index: 2, follow: { time: 0, price: 1 } },
      ],
    },
  ])('splits the flat-line follow factors of anchor $index', ({ index, moving }) => {
    expect(resolveAnchorFollowers('flat-line', index)).toEqual(moving)
  })

  it.each([
    { index: 0, partner: 3 },
    { index: 1, partner: 2 },
    { index: 2, partner: 1 },
    { index: 3, partner: 0 },
  ])('mirrors the disjoint-channel same-X anchor of anchor $index', ({ index, partner }) => {
    expect(resolveAnchorFollowers('disjoint-channel', index)).toEqual([
      { index },
      { index: partner, follow: { time: 1, price: -1 } },
    ])
  })

  it.each([
    {
      index: 0,
      moving: [
        { index: 0 },
        { index: 3, follow: { time: 1, price: 0 } },
        { index: 1, follow: { time: 0, price: 1 } },
      ],
    },
    {
      index: 1,
      moving: [
        { index: 1 },
        { index: 2, follow: { time: 1, price: 0 } },
        { index: 0, follow: { time: 0, price: 1 } },
      ],
    },
    {
      index: 2,
      moving: [
        { index: 2 },
        { index: 1, follow: { time: 1, price: 0 } },
        { index: 3, follow: { time: 0, price: 1 } },
      ],
    },
    {
      index: 3,
      moving: [
        { index: 3 },
        { index: 0, follow: { time: 1, price: 0 } },
        { index: 2, follow: { time: 0, price: 1 } },
      ],
    },
  ])('keeps the rectangle axis-aligned when dragging corner $index', ({ index, moving }) => {
    expect(resolveAnchorFollowers('rectangle', index)).toEqual(moving)
  })

  it('falls back to moving only the dragged anchor for unregistered kinds', () => {
    expect(resolveAnchorFollowers('trend-line', 1)).toEqual([{ index: 1 }])
  })
})

describe('resolveLineHandle', () => {
  it.each([
    { kind: 'flat-line', lineIndex: 0, handle: { index: 0, from: 0, to: 1, axis: 'price' } },
    { kind: 'flat-line', lineIndex: 1, handle: { index: 1, from: 2, to: 3, axis: 'price' } },
    { kind: 'disjoint-channel', lineIndex: 0, handle: { index: 0, from: 0, to: 1, axis: 'price' } },
    { kind: 'parallel-channel', lineIndex: 1, handle: { index: 1, from: 2, to: 3, axis: 'price' } },
    { kind: 'rectangle', lineIndex: 0, handle: { index: 0, from: 0, to: 1, axis: 'price' } },
    { kind: 'rectangle', lineIndex: 1, handle: { index: 1, from: 1, to: 2, axis: 'time' } },
    { kind: 'rectangle', lineIndex: 2, handle: { index: 2, from: 2, to: 3, axis: 'price' } },
    { kind: 'rectangle', lineIndex: 3, handle: { index: 3, from: 3, to: 0, axis: 'time' } },
    // 出界的线下标与未登记线表的图元一律返回 null。
    { kind: 'flat-line', lineIndex: 2, handle: null },
    { kind: 'trend-line', lineIndex: 0, handle: null },
  ] as const)('resolves $kind line $lineIndex to $handle', ({ kind, lineIndex, handle }) => {
    expect(resolveLineHandle(kind, lineIndex)).toEqual(handle)
  })
})
