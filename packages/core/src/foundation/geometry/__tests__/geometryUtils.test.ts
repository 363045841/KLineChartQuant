/** 验证 geometry 模块的二维几何谓词与构造（点/圆/矩形/线段/多边形）。 */
import { describe, expect, it } from 'vitest'
import {
  distanceSq,
  midpoint,
  pointInCircle,
  pointInPolygon,
  pointInRect,
  pointToSegmentDistanceSq,
  rectFromPoints,
  segmentIntersectsRect,
} from '../impl/geometryUtils'
import type { Point, Rect } from '../types'

const ORIGIN: Point = { x: 0, y: 0 }

describe('distanceSq / midpoint', () => {
  it.each([
    ['axis aligned', { x: 0, y: 0 }, { x: 3, y: 4 }, 25],
    ['same point', { x: 5, y: 5 }, { x: 5, y: 5 }, 0],
    ['negative delta', { x: -2, y: 1 }, { x: 1, y: -3 }, 25],
  ])('returns squared distance for %s', (_label, a, b, expected) => {
    expect(distanceSq(a as Point, b as Point)).toBe(expected)
  })

  it('returns the midpoint of two points', () => {
    expect(midpoint({ x: -2, y: 0 }, { x: 4, y: 6 })).toEqual({ x: 1, y: 3 })
  })
})

describe('pointInCircle', () => {
  it.each([
    ['inside', { x: 3, y: 4 }, true],
    ['on boundary', { x: 5, y: 0 }, true],
    ['outside', { x: 5, y: 1 }, false],
  ])('detects %s', (_label, point, expected) => {
    expect(pointInCircle(point as Point, ORIGIN, 5)).toBe(expected)
  })
})

describe('rectFromPoints / pointInRect', () => {
  it('orders arbitrary diagonal points into a rect', () => {
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 0, y: 5 })).toEqual({
      left: 0,
      top: 5,
      right: 10,
      bottom: 20,
    })
  })

  const rect: Rect = { left: 0, top: 0, right: 10, bottom: 10 }

  it.each([
    ['inside', { x: 5, y: 5 }, true],
    ['on boundary', { x: 0, y: 10 }, true],
    ['outside x', { x: 11, y: 5 }, false],
    ['outside y', { x: 5, y: -1 }, false],
  ])('detects %s', (_label, point, expected) => {
    expect(pointInRect(point as Point, rect)).toBe(expected)
  })
})

describe('pointToSegmentDistanceSq', () => {
  it.each([
    ['projected onto segment', 5, 3, { x: 0, y: 0 }, { x: 10, y: 0 }, 9],
    ['beyond the start', -3, 0, { x: 0, y: 0 }, { x: 10, y: 0 }, 9],
    ['degenerate segment', 3, 4, { x: 0, y: 0 }, { x: 0, y: 0 }, 25],
  ])('returns squared distance for %s', (_label, px, py, a, b, expected) => {
    expect(pointToSegmentDistanceSq(px as number, py as number, a as Point, b as Point)).toBe(
      expected,
    )
  })
})

describe('pointInPolygon', () => {
  const square: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it.each([
    ['inside', { x: 5, y: 5 }, true],
    ['right of polygon', { x: 15, y: 5 }, false],
    ['above polygon', { x: 5, y: -1 }, false],
  ])('detects point %s', (_label, point, expected) => {
    expect(pointInPolygon(point as Point, square)).toBe(expected)
  })
})

describe('segmentIntersectsRect', () => {
  const rect: Rect = { left: 0, top: 0, right: 10, bottom: 10 }

  it.each([
    ['endpoint inside', { x: -5, y: 5 }, { x: 5, y: 5 }, true],
    ['fully inside', { x: 2, y: 2 }, { x: 8, y: 8 }, true],
    ['crossing through', { x: -5, y: 5 }, { x: 15, y: 5 }, true],
    ['outside without crossing', { x: -5, y: 20 }, { x: 15, y: 20 }, false],
    ['outside to the left', { x: -5, y: -5 }, { x: -1, y: 15 }, false],
  ])('detects %s', (_label, a, b, expected) => {
    expect(segmentIntersectsRect(a as Point, b as Point, rect)).toBe(expected)
  })
})
