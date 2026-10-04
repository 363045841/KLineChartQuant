import { describe, expect, it } from 'vitest'

import { findVisibleBarRange } from '../visibleBarIndex'

describe('findVisibleBarRange', () => {
  it('shrinks both buffered edges to the bars whose centers are inside the content area', () => {
    // range 左右各扩 1 根：索引 1 中心 -5 屏外，索引 4 中心 25 超出内容区右缘
    const range = findVisibleBarRange({ start: 1, end: 5 }, [-5, 5, 15, 25], 0, 20)

    expect(range).toEqual({ first: 2, last: 3 })
  })

  it('keeps range start and end when every center is visible', () => {
    const range = findVisibleBarRange({ start: 0, end: 3 }, [0, 10, 20], 0, 100)

    expect(range).toEqual({ first: 0, last: 2 })
  })

  it('applies scrollLeft to the screen projection', () => {
    // 索引 2/3 中心 -5/5，减 scrollLeft=10 后只剩索引 4（中心 5）可见
    const range = findVisibleBarRange({ start: 2, end: 5 }, [-5, 5, 15], 10, 8)

    expect(range).toEqual({ first: 4, last: 4 })
  })

  it('returns an empty range when all centers are scrolled past the left edge', () => {
    const range = findVisibleBarRange({ start: 0, end: 3 }, [-30, -20, -10], 0, 100)

    expect(range).toEqual({ first: 0, last: -1 })
  })

  it('returns an empty range when all centers are beyond the right edge', () => {
    const range = findVisibleBarRange({ start: 0, end: 3 }, [100, 110, 120], 0, 50)

    expect(range).toEqual({ first: 0, last: -1 })
  })

  it('returns an empty range when no centers are provided', () => {
    const range = findVisibleBarRange({ start: 0, end: 3 }, [], 0, 100)

    expect(range).toEqual({ first: 0, last: -1 })
  })
})
