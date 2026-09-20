import { describe, expect, it } from 'vitest'

import {
  createMockCanvasContext,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import { createCandleRenderer } from '../candle'

describe('candle renderer in comparison view', () => {
  it('skips drawing candles in comparison mode', () => {
    const ctx = createMockCanvasContext()
    createCandleRenderer().draw(
      createMockRenderContext({
        ctx,
        dataView: 'comparison',
        comparisonSymbols: [{ symbol: 'CMP', market: 'CN', period: 'daily' }],
      }),
    )
    expect(ctx.save).not.toHaveBeenCalled()
    expect(ctx.fillRect).not.toHaveBeenCalled()
  })

  it('still draws when no comparison symbols are present', () => {
    const ctx = createMockCanvasContext()
    expect(() => createCandleRenderer().draw(createMockRenderContext({ ctx }))).not.toThrow()
  })
})
