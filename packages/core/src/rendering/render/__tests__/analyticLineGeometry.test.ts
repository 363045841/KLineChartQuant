/** 验证共享线条几何的物理 AA 边距、距离属性与退化段处理。 */
import { describe, expect, it } from 'vitest'
import { buildAnalyticLineGeometry } from '../analyticLineGeometry'

describe('buildAnalyticLineGeometry', () => {
  it.each([1, 1.25, 1.5, 2])('pads each side by one physical pixel at DPR %s', (dpr) => {
    const vertices = buildAnalyticLineGeometry(
      [
        { x: 2, y: 10 },
        { x: 22, y: 10 },
      ],
      1,
      dpr,
    )!
    expect(vertices).toHaveLength(24)
    expect((vertices[1]! - 10) * dpr).toBeCloseTo(dpr / 2 + 1)
    expect(vertices[2]).toBeCloseTo(dpr / 2 + 1)
    expect(vertices[3]).toBeCloseTo(dpr / 2)
    expect(vertices[6]).toBeCloseTo(-vertices[2]!)
    expect(vertices[0]).toBe(2)
    expect(vertices[8]).toBe(22)
  })

  it('preserves the diagonal centerline and signed perpendicular distances', () => {
    const vertices = buildAnalyticLineGeometry(
      [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
      2,
      2,
    )!
    expect(vertices[0]! + vertices[4]!).toBeCloseTo(0)
    expect(vertices[1]! + vertices[5]!).toBeCloseTo(0)
    expect(Math.hypot(vertices[0]!, vertices[1]!) * 2).toBeCloseTo(3)
    expect(vertices[0]! * 3 + vertices[1]! * 4).toBeCloseTo(0)
    expect(vertices[3]).toBe(2)
  })

  it('skips duplicate and nonfinite segments without leaving unused vertices', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: NaN, y: 0 },
    ]
    expect(buildAnalyticLineGeometry(points, 1, 1)).toHaveLength(24)
    expect(buildAnalyticLineGeometry(points.slice(0, 2), 1, 1)).toBeNull()
  })

  it.each([
    [0, 1],
    [-1, 1],
    [NaN, 1],
    [1, 0],
    [1, Infinity],
  ])('rejects width %s and DPR %s', (width, dpr) => {
    expect(
      buildAnalyticLineGeometry(
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        width,
        dpr,
      ),
    ).toBeNull()
  })
})
