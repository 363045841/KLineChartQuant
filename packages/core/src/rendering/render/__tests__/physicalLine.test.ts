/** 验证线段在不同 DPR 下的物理像素对齐规则。 */

import { describe, expect, it } from 'vitest'

import { prepareLineStripForPhysicalPixels } from '../physicalLine'

describe('prepareLineStripForPhysicalPixels', () => {
  it('preserves fractional physical width and snaps an axial edge to the pixel grid', () => {
    const strip = prepareLineStripForPhysicalPixels(
      {
        points: [
          { x: 0.2, y: 5.1 },
          { x: 10.7, y: 5.1 },
        ],
        color: '#f00',
        width: 1,
      },
      1.25,
    )

    expect(strip).toEqual({
      points: [
        { x: 0, y: 5.3 },
        { x: 10.4, y: 5.3 },
      ],
      color: '#f00',
      width: 1,
    })
  })

  it.each([
    [1, 1],
    [1.25, 1],
    [1.5, 1],
    [2, 1],
  ])('keeps one CSS pixel at DPR %s', (dpr, expectedWidth) => {
    const strip = prepareLineStripForPhysicalPixels(
      {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        color: '#f00',
        width: 1,
      },
      dpr,
    )

    expect(strip.width).toBe(expectedWidth)
  })

  it('clamps widths below one physical pixel', () => {
    const strip = prepareLineStripForPhysicalPixels(
      {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        color: '#f00',
        width: 0.5,
      },
      1.25,
    )

    expect(strip.width).toBe(0.8)
  })

  it('preserves diagonal vertices while adapting the physical line width', () => {
    const strip = prepareLineStripForPhysicalPixels(
      {
        points: [
          { x: 0.2, y: 5.1 },
          { x: 10.7, y: 8.4 },
        ],
        color: '#0f0',
        width: 1,
      },
      1.25,
    )

    expect(strip).toEqual({
      points: [
        { x: 0.2, y: 5.1 },
        { x: 10.7, y: 8.4 },
      ],
      color: '#0f0',
      width: 1,
    })
  })

  it('snaps vertical lines after applying scrollLeft', () => {
    const strip = prepareLineStripForPhysicalPixels(
      {
        points: [
          { x: 10.2, y: 0.2 },
          { x: 10.2, y: 10.7 },
        ],
        color: '#00f',
        width: 1,
      },
      1.25,
      0.3,
    )

    expect(strip).toEqual({
      points: [
        { x: 10.4, y: 0 },
        { x: 10.4, y: 10.4 },
      ],
      color: '#00f',
      width: 1,
    })
    expect((strip.points[0]!.x - 0.3) * 1.25).toBeCloseTo(12.625)
  })
})
