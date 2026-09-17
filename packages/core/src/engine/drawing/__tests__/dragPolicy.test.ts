/** 验证拖拽策略把命中目标解析为要移动的锚点及其位移分量。 */
import { describe, expect, it } from 'vitest'

import { resolveDragAnchors } from '../dragPolicy'

describe('resolveDragAnchors', () => {
  it.each([
    { index: 0, moving: [{ index: 0 }, { index: 2 }] },
    { index: 1, moving: [{ index: 1 }, { index: 3 }] },
    { index: 2, moving: [{ index: 0 }, { index: 2 }] },
    { index: 3, moving: [{ index: 1 }, { index: 3 }] },
  ])('pairs the parallel-channel role of anchor $index', ({ index, moving }) => {
    expect(resolveDragAnchors('parallel-channel', { type: 'anchor', index }, 4)).toEqual(moving)
  })

  it('translates a single parallel-channel edge', () => {
    expect(resolveDragAnchors('parallel-channel', { type: 'edge', anchors: [2, 3] }, 4)).toEqual([
      { index: 2 },
      { index: 3 },
    ])
  })

  it.each([
    { index: 0, moving: [{ index: 0 }, { index: 2, axis: 'time' }] },
    { index: 1, moving: [{ index: 1 }, { index: 3, axis: 'time' }] },
    {
      index: 2,
      moving: [{ index: 2 }, { index: 0, axis: 'time' }, { index: 3, axis: 'price' }],
    },
    {
      index: 3,
      moving: [{ index: 3 }, { index: 1, axis: 'time' }, { index: 2, axis: 'price' }],
    },
  ])('splits the flat-line follow axis of anchor $index', ({ index, moving }) => {
    expect(resolveDragAnchors('flat-line', { type: 'anchor', index }, 4)).toEqual(moving)
  })

  it('carries the flat-line endpoints in time when dragging the slanted edge', () => {
    expect(resolveDragAnchors('flat-line', { type: 'edge', anchors: [0, 1] }, 4)).toEqual([
      { index: 0 },
      { index: 1 },
      { index: 2, axis: 'time' },
      { index: 3, axis: 'time' },
    ])
  })

  it('carries the slanted endpoints in time when dragging the flat edge', () => {
    expect(resolveDragAnchors('flat-line', { type: 'edge', anchors: [2, 3] }, 4)).toEqual([
      { index: 2 },
      { index: 3 },
      { index: 0, axis: 'time' },
      { index: 1, axis: 'time' },
    ])
  })

  it('moves every anchor when dragging the whole drawing', () => {
    expect(resolveDragAnchors('flat-line', { type: 'all' }, 4)).toEqual([
      { index: 0 },
      { index: 1 },
      { index: 2 },
      { index: 3 },
    ])
  })

  it('falls back to the default strategy for unregistered kinds', () => {
    expect(resolveDragAnchors('trend-line', { type: 'anchor', index: 1 }, 2)).toEqual([
      { index: 1 },
    ])
    expect(resolveDragAnchors('trend-line', { type: 'edge', anchors: [0, 1] }, 2)).toEqual([
      { index: 0 },
      { index: 1 },
    ])
    expect(resolveDragAnchors('trend-line', { type: 'all' }, 2)).toEqual([
      { index: 0 },
      { index: 1 },
    ])
  })
})
