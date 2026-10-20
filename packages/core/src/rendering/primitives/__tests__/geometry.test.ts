/** 公共几何回归：dash 跨折点、相位、闭合描边与透明并集方向。 */
import { describe, expect, it } from 'vitest'
import { dashPath, rectPath, strokePaths } from '../impl/geometry.js'

describe('primitive geometry', () => {
  it('keeps dash phase across corners and repeats odd patterns', () => {
    expect(dashPath([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }], [6, 4])).toEqual([
      [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 1 }],
      [{ x: 5, y: 5 }, { x: 5, y: 10 }],
    ])
    expect(dashPath([{ x: 0, y: 0 }, { x: 10, y: 0 }], [2], 1)).toEqual([
      [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      [{ x: 3, y: 0 }, { x: 5, y: 0 }],
      [{ x: 7, y: 0 }, { x: 9, y: 0 }],
    ])
  })

  it('handles zero dash entries without losing progress', () => {
    expect(dashPath([{ x: 0, y: 0 }, { x: 5, y: 0 }], [0, 2])).toEqual([])
    expect(dashPath([{ x: 0, y: 0 }, { x: 5, y: 0 }], [0, 0])).toHaveLength(1)
  })

  it('normalizes all stroke pieces to the same winding, including miter corners', () => {
    const paths = strokePaths({ kind: 'stroke', paths: [rectPath(10, 10, 20, 20)], closed: true, width: 4, color: 'red' }, 1.25)
    expect(paths).toHaveLength(8)
    for (const path of paths) {
      let area = 0
      for (let i = 0; i < path.length; i++) {
        const a = path[i]!, b = path[(i + 1) % path.length]!
        area += a.x * b.y - b.x * a.y
      }
      expect(area).toBeGreaterThan(0)
      expect(path.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
    }
  })
})
