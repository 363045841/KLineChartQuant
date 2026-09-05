// Tooltip 定位策略测试

import { describe, expect, it } from 'vitest'

import { computeTooltipPosition } from '../tooltipPosition'

const adaptiveInput = {
  mouseX: 300,
  mouseY: 100,
  viewWidth: 600,
  viewHeight: 400,
  plotWidth: 600,
  plotHeight: 400,
  tooltipSize: { width: 220, height: 180 },
  useAnchorPositioning: false,
  mode: 'adaptive' as const,
}

describe('computeTooltipPosition', () => {
  it('moves a top-left tooltip to the top-right when the crosshair overlaps it', () => {
    const result = computeTooltipPosition({
      ...adaptiveInput,
      adaptiveCorner: 'top-left',
      crosshairX: 100,
    })

    expect(result.pos).toEqual({ x: 368, y: 12 })
  })

  it('moves a top-right tooltip to the top-left when the crosshair overlaps it', () => {
    const result = computeTooltipPosition({
      ...adaptiveInput,
      adaptiveCorner: 'top-right',
      crosshairX: 500,
    })

    expect(result.pos).toEqual({ x: 12, y: 12 })
  })
})
