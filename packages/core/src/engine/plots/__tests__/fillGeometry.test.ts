// 验证带状填充的交点、颜色裁切和缺点断开。
import { describe, expect, it } from 'vitest'
import { buildFillBands } from '../impl/fillGeometry.js'

// 构造间距为 10 的折线，undefined 表示缺点。
function points(values: readonly (number | undefined)[]) {
  const result = new Map<number, { x: number; y: number }>()
  values.forEach((y, index) => {
    if (y !== undefined) result.set(index, { x: index * 10, y })
  })
  return result
}

describe('带状填充几何', () => {
  it.each([
    [true, false],
    [false, true],
    [true, true],
  ])(
    '阶梯填充在中点跳变，fromStep=%s toStep=%s',
    (fromStep, toStep) => {
      const bands = buildFillBands(
        points([0, 8]), points([12, 16]), [null, 'green'], 0, fromStep, toStep,
      )
      expect(bands).toHaveLength(1)
      const leftFrom = { x: 5, y: fromStep ? 0 : 4 }
      const rightFrom = { x: 5, y: fromStep ? 8 : 4 }
      const leftTo = { x: 5, y: toStep ? 12 : 14 }
      const rightTo = { x: 5, y: toStep ? 16 : 14 }
      expect(bands[0]?.polygons).toEqual([
        [{ x: 0, y: 0 }, leftFrom, leftTo, { x: 0, y: 12 }],
        [rightFrom, { x: 10, y: 8 }, { x: 10, y: 16 }, rightTo],
      ])
    },
  )

  it('阶梯与斜线相交时分割面积，空点仍不填充', () => {
    const bands = buildFillBands(points([2, 8]), points([0, 10]), [null, 'green'], 0, true)
    expect(bands[0]?.polygons).toHaveLength(4)
    expect(bands[0]?.polygons[0]).toContainEqual({ x: 2, y: 2 })
    expect(bands[0]?.polygons[2]).toContainEqual({ x: 8, y: 8 })
    expect(
      buildFillBands(
        points([0, undefined, 8]),
        points([10, 10, 10]),
        ['green', 'green', 'green'],
        0,
        true,
      ),
    ).toEqual([])
  })

  it('整段使用右端颜色，只在真实交点裁切且顶点贴合折线', () => {
    const bands = buildFillBands(points([0, 8]), points([2, 2]), ['red', 'green'], 0)
    expect(bands.map((band) => [band.color, band.polygons.length])).toEqual([['green', 2]])
    expect(bands[0]?.polygons[0]).toEqual([
      { x: 0, y: 0 },
      { x: 2.5, y: 2 },
      { x: 2.5, y: 2 },
      { x: 0, y: 2 },
    ])
    for (const band of bands) {
      for (const polygon of band.polygons) {
        for (const point of polygon) {
          expect(point.y === 2 || point.y === point.x * 0.8).toBe(true)
        }
      }
    }
  })

  it('同色相邻带子合并成一条链，颜色变化处断开', () => {
    const merged = buildFillBands(points([0, 1, 2]), points([4, 4, 4]), ['red', 'red', 'red'], 0)
    expect(merged).toEqual([
      {
        color: 'red',
        polygons: [
          [
            { x: 0, y: 0 },
            { x: 10, y: 1 },
            { x: 20, y: 2 },
            { x: 20, y: 4 },
            { x: 10, y: 4 },
            { x: 0, y: 4 },
          ],
        ],
      },
    ])
    const split = buildFillBands(points([0, 1, 2]), points([4, 4, 4]), ['red', 'red', 'green'], 0)
    expect(split.map((band) => [band.color, band.polygons.length])).toEqual([
      ['red', 1],
      ['green', 1],
    ])
  })

  it('使用右端颜色覆盖整段，不跨缺点连接', () => {
    const bands = buildFillBands(points([0, 1, undefined, 3]), points([4, 4, 4, 4]), [
      null,
      'green',
      'red',
      'red',
    ], 0)
    expect(bands).toHaveLength(1)
    expect(bands[0]?.polygons).toEqual([
      [
        { x: 0, y: 0 },
        { x: 10, y: 1 },
        { x: 10, y: 4 },
        { x: 0, y: 4 },
      ],
    ])
  })

  it('右端颜色为 null 时整段留空', () => {
    expect(buildFillBands(points([0, 1]), points([4, 4]), ['red', null], 0)).toEqual([])
  })

  it('颜色按 Plot.data 下标对齐，位移后的显示下标仍取得到颜色', () => {
    // 显示下标 2 对应源 bar 0；右端颜色应取 colors[1]，而不是 colors[3]。
    const displaced = buildFillBands(
      new Map([[2, { x: 20, y: 0 }], [3, { x: 30, y: 8 }]]),
      new Map([[2, { x: 20, y: 2 }], [3, { x: 30, y: 2 }]]),
      ['red', 'green'],
      2,
    )
    expect(displaced.map((band) => band.color)).toEqual(['green'])
    // 未减位移时这里会查到 colors[3] 并丢整段，位移区就出现缺口。
    expect(displaced[0]?.polygons).toHaveLength(2)
  })

  it('重合线和孤立点不生成面积', () => {
    expect(buildFillBands(points([1, 1]), points([1, 1]), ['red', 'red'], 0)).toEqual([])
    expect(buildFillBands(points([1]), points([2]), ['red'], 0)).toEqual([])
  })
})
