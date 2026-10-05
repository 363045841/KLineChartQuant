import { describe, expect, it } from 'vitest'
import { computeRegressionChannel } from '../impl/regressionChannel.js'

describe('computeRegressionChannel', () => {
  it('keeps fitted values attached to their actual anchor indexes', () => {
    const model = computeRegressionChannel([10, 20, 30, 40], 3, 0, 2)

    expect(model?.firstValue).toBe(40)
    expect(model?.secondValue).toBe(10)
    expect(model?.regression.slope).toBe(10)
  })

  it('rejects invalid prices and normalizes invalid sigma', () => {
    expect(computeRegressionChannel([10, Number.NaN, 30], 0, 2, 2)).toBeNull()
    expect(computeRegressionChannel([10, 20, 30], 0, 2, -1)?.sigma).toBe(2)
  })
})
