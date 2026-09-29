import { describe, expect, it } from 'vitest'

import {
  createMockCanvasContext,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import type { RenderContext } from '@/foundation/plugin/index'
import { createCandleLayer } from '../candle'

/** 以主图身份调用 K 线 Layer.paint。 */
function paint(context: RenderContext): void {
  createCandleLayer().paint({ ...context, paneId: 'main', clear: false })
}

describe('candle renderer in comparison view', () => {
  it('skips drawing candles in comparison mode', () => {
    const ctx = createMockCanvasContext()
    paint(
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
    expect(() => paint(createMockRenderContext({ ctx }))).not.toThrow()
  })
})
