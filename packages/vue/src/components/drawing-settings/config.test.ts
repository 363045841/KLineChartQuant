import { describe, expect, it } from 'vitest'

import { drawingSettingsConfigs } from './config'

describe('drawing settings text fields', () => {
  it('enables one attached text field only for basic drawings', () => {
    const basicLines = [
      'trend-line', 'ray', 'extended-line', 'arrow',
      'horizontal-line', 'horizontal-ray', 'vertical-line',
    ] as const
    for (const kind of basicLines) expect(drawingSettingsConfigs[kind].text).toEqual(['line'])
    expect(drawingSettingsConfigs.rectangle.text).toEqual(['area'])

    const composites = [
      'fib-retracement', 'cross-line', 'info-line', 'parallel-channel',
      'regression-channel', 'flat-line', 'disjoint-channel',
    ] as const
    for (const kind of composites) expect(drawingSettingsConfigs[kind].text).toEqual([])
  })
})
