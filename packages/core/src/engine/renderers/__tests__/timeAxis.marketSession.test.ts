import { describe, expect, it, vi } from 'vitest'

import type { RenderContext } from '../../../foundation/plugin/types'
import { HK_MARKET_SESSION } from '../../../foundation/utils/sessionTimeLabels'
import { createTimeAxisRendererPlugin } from '../timeAxis'

describe('time axis market session', () => {
  it('uses the active HK session from render context', () => {
    const fillText = vi.fn()
    const ctx = {
      setTransform: vi.fn(),
      scale: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText,
    } as unknown as CanvasRenderingContext2D
    const context = {
      ctx,
      data: [{ timestamp: new Date('2026-07-28T09:30:00+08:00').getTime() }],
      range: { start: 0, end: 1 },
      scrollLeft: 0,
      kWidth: 1,
      kGap: 0,
      dpr: 1,
      paneWidth: 330,
      kLineCenters: [0.5],
      period: 'timeshare',
      marketSession: HK_MARKET_SESSION,
      theme: 'light',
    } as unknown as RenderContext

    createTimeAxisRendererPlugin({ height: 24 }).draw(context)

    const labels = fillText.mock.calls.map(([text]) => text)
    expect(labels).toContain('16:00')
    expect(labels).not.toContain('15:00')
  })
})
