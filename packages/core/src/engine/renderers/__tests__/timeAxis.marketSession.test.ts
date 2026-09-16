import { describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit'

import { HK_MARKET_SESSION } from '../../../foundation/utils/sessionTimeLabels'
import { createTimeAxisRendererPlugin } from '../timeAxis'

describe('time axis market session', () => {
  it('uses the active HK session from render context', () => {
    const ctx = createMockCanvasContext()
    const context = createMockRenderContext({
      ctx,
      data: [
        {
          timestamp: new Date('2026-07-28T09:30:00+08:00').getTime(),
          open: 0,
          high: 0,
          low: 0,
          close: 0,
        },
        {
          timestamp: new Date('2026-07-28T16:00:00+08:00').getTime(),
          open: 0,
          high: 0,
          low: 0,
          close: 0,
        },
      ],
      range: { start: 0, end: 2 },
      kWidth: 1,
      kGap: 0,
      paneWidth: 330,
      kLineCenters: [17, 301],
      period: 'timeshare',
      marketSession: HK_MARKET_SESSION,
    })

    createTimeAxisRendererPlugin({ height: 24 }).draw(context)

    const fillText = vi.mocked(ctx.fillText)
    const labels = fillText.mock.calls.map(([text]) => text)
    expect(labels).toContain('16:00')
    expect(labels).not.toContain('15:00')
    expect(fillText).toHaveBeenCalledWith('09:30', 17, expect.any(Number))
    expect(fillText).toHaveBeenCalledWith('16:00', 301, expect.any(Number))
  })
})
