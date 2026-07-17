import { describe, expect, it } from 'vitest'

import { prepareLineStripForPhysicalPixels } from '../physicalLine'

describe('prepareLineStripForPhysicalPixels', () => {
  it('snaps a horizontal one-pixel line to the physical pixel center', () => {
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
        { x: 0, y: 5.2 },
        { x: 10.4, y: 5.2 },
      ],
      color: '#f00',
      width: 0.8,
    })
  })

  it('preserves diagonal vertices while quantizing the physical line width', () => {
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
      width: 0.8,
    })
  })
})
