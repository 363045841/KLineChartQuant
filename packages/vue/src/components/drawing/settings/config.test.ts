import { describe, expect, it } from 'vitest'

import { parseDrawingSettingsConfig } from './config'

describe('drawing settings config', () => {
  it.each([
    { style: ['not-a-style'] },
    { style: ['fill', 'fill'] },
    { style: ['stroke'], text: ['line'] },
    { style: ['stroke'], unknown: true },
  ])('rejects unsupported settings: %j', (config) => {
    expect(() => parseDrawingSettingsConfig('trend-line', config)).toThrow(
      'Invalid drawing settings: trend-line',
    )
  })
})
