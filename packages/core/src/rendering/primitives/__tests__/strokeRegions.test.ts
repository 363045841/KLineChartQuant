/** 描边区域选择与四边形切边：端帽、尖角、共线、斜接上限、虚线与重复点。 */
import { describe, expect, it } from 'vitest'
import { emitStrokePolygons, STROKE_REGION, strokeRegion } from '../impl/strokeRegions.js'
import type { PaintPrimitive, PrimitivePoint } from '../types.js'

type Stroke = Extract<PaintPrimitive, { kind: 'stroke' }>

/** 只声明用例关心的字段，其余取默认直线。 */
function stroke(overrides: Partial<Stroke> = {}): Stroke {
  return {
    kind: 'stroke',
    paths: [
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    ],
    color: 'red',
    width: 2,
    ...overrides,
  }
}

/** 收集展开后的四边形。 */
function quads(input: Stroke): PrimitivePoint[][] {
  const result: PrimitivePoint[][] = []
  emitStrokePolygons(input, (first, second, third, fourth) => {
    result.push([first, second, third, fourth])
  })
  return result
}

/** 坐标保留六位，避免浮点尾数干扰断言。 */
function flat(points: readonly PrimitivePoint[]): number[] {
  return points.flatMap((point) => [
    Math.round(point.x * 1e6) / 1e6,
    Math.round(point.y * 1e6) / 1e6,
  ])
}

describe('stroke region selection', () => {
  it('uses capsules only for opaque round joins with round caps', () => {
    expect(strokeRegion(stroke({ join: 'round', cap: 'round' }))).toBe(STROKE_REGION.capsule)
    // 虚线会在共享圆盘上取到半段，退回三角化。
    expect(strokeRegion(stroke({ join: 'round', cap: 'round', dash: [4, 2] }))).toBeNull()
  })

  it('uses quads for miter joins with butt or square caps', () => {
    expect(strokeRegion(stroke())).toBe(STROKE_REGION.polygon)
    expect(strokeRegion(stroke({ join: 'miter', cap: 'square' }))).toBe(STROKE_REGION.polygon)
  })

  it('leaves unsupported styles on the tessellated path', () => {
    expect(strokeRegion(stroke({ cap: 'round' }))).toBeNull()
    expect(strokeRegion(stroke({ join: 'bevel' }))).toBeNull()
    expect(strokeRegion(stroke({ closed: true }))).toBeNull()
    expect(strokeRegion(stroke({ dataSpace: true }))).toBeNull()
    expect(strokeRegion(stroke({ width: 0 }))).toBeNull()
  })
})

describe('stroke quad geometry', () => {
  it('cuts a straight butt stroke at its endpoints', () => {
    expect(quads(stroke()).map(flat)).toEqual([[0, 1, 100, 1, 100, -1, 0, -1]])
  })

  it('extends square caps by half the width', () => {
    expect(quads(stroke({ cap: 'square' })).map(flat)).toEqual([[-1, 1, 101, 1, 101, -1, -1, -1]])
  })

  it('cuts a right-angle joint on the angle bisector', () => {
    const [first, second] = quads(
      stroke({
        width: 4,
        paths: [
          [
            { x: 10, y: 20 },
            { x: 40, y: 20 },
            { x: 40, y: 50 },
          ],
        ],
      }),
    )
    expect(flat(first!)).toEqual([10, 22, 38, 22, 42, 18, 10, 18])
    expect(flat(second!)).toEqual([38, 22, 38, 50, 42, 50, 42, 18])
  })

  it('gives both sides the same joint cut so the quads tile without overlap', () => {
    const [first, second] = quads(
      stroke({
        paths: [
          [
            { x: 10, y: 20 },
            { x: 40, y: 20 },
            { x: 40, y: 50 },
          ],
        ],
      }),
    )
    expect(flat([first![1]!, first![2]!])).toEqual(flat([second![0]!, second![3]!]))
  })

  it('cuts near-collinear joints perpendicular to the path', () => {
    const [first, second] = quads(
      stroke({
        paths: [
          [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 200, y: 0 },
          ],
        ],
      }),
    )
    expect(flat([first![1]!, first![2]!])).toEqual([100, 1, 100, -1])
    expect(flat([second![0]!, second![3]!])).toEqual([100, 1, 100, -1])
  })

  it('pulls over-long miters back to the miter limit', () => {
    // 折返 170° 的尖角：斜接长度约为半宽的 11.5 倍，超过默认上限 10。
    const [, second] = quads(
      stroke({
        paths: [
          [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 1.52, y: 17.36 },
          ],
        ],
      }),
    )
    for (const corner of [second![0]!, second![3]!])
      expect(Math.hypot(corner.x - 100, corner.y)).toBeCloseTo(10, 3)
  })

  it('expands dashes into separate capped quads', () => {
    const result = quads(
      stroke({
        dash: [4, 2],
        paths: [
          [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
        ],
      }),
    )
    expect(result).toHaveLength(2)
    expect(flat(result[0]!)).toEqual([0, 1, 4, 1, 4, -1, 0, -1])
  })

  it('drops repeated points before cutting', () => {
    expect(
      quads(
        stroke({
          paths: [
            [
              { x: 0, y: 0 },
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
          ],
        }),
      ),
    ).toHaveLength(1)
  })
})
