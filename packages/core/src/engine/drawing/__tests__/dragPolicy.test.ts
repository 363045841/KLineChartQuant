/** 验证拖拽策略把命中目标解析为一起移动的锚点下标。 */
import { describe, expect, it } from 'vitest'

import { resolveDragAnchors } from '../dragPolicy'

describe('resolveDragAnchors', () => {
  it.each([
    { index: 0, moving: [0, 2] },
    { index: 1, moving: [1, 3] },
    { index: 2, moving: [0, 2] },
    { index: 3, moving: [1, 3] },
  ])('pairs the parallel-channel role of anchor $index', ({ index, moving }) => {
    expect(resolveDragAnchors('parallel-channel', { type: 'anchor', index }, 4)).toEqual(moving)
  })

  it('translates a single parallel-channel edge', () => {
    expect(resolveDragAnchors('parallel-channel', { type: 'edge', anchors: [2, 3] }, 4)).toEqual([
      2, 3,
    ])
  })

  it('moves every anchor when dragging the whole parallel channel', () => {
    expect(resolveDragAnchors('parallel-channel', { type: 'all' }, 4)).toEqual([0, 1, 2, 3])
  })

  it('falls back to the default strategy for unregistered kinds', () => {
    expect(resolveDragAnchors('trend-line', { type: 'anchor', index: 1 }, 2)).toEqual([1])
    expect(resolveDragAnchors('trend-line', { type: 'edge', anchors: [0, 1] }, 2)).toEqual([0, 1])
    expect(resolveDragAnchors('trend-line', { type: 'all' }, 2)).toEqual([0, 1])
  })
})
