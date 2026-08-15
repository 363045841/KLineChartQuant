import { describe, expect, it } from 'vitest'

import { formatVolumeScaleLabel } from '../Indicator/scale/volume_scale'

describe('formatVolumeScaleLabel', () => {
  it('keeps small timeshare volumes in their original unit', () => {
    expect(formatVolumeScaleLabel(9_999)).toBe('9999.00')
  })

  it('formats medium and large volumes with meaningful units', () => {
    expect(formatVolumeScaleLabel(25_000)).toBe('2.50万')
    expect(formatVolumeScaleLabel(250_000_000)).toBe('2.50B')
  })
})
