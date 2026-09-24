import { describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
  createMockServiceHost,
  type MockCanvasContext,
} from '@/engine/__tests__/helpers/renderTestKit'

import type { RenderContext } from '@/foundation/plugin/index'
import { VolumeIndicatorDefinition } from '../subVolume'

/** 构造记录每次填充颜色的上下文。 */
function createContext(): { context: RenderContext; fills: string[] } {
  const ctx = createMockCanvasContext()
  const fills: string[] = []
  ctx.fillRect = vi.fn(function (this: MockCanvasContext) {
    fills.push(String(this.fillStyle))
  })

  const context = createMockRenderContext({
    ctx,
    pane: {
      id: 'sub',
      top: 0,
      height: 100,
      yAxis: { getDisplayRange: (range) => range ?? { maxPrice: 0, minPrice: 0 } },
    },
    data: [
      { timestamp: 1, price: 10, average: 10, volume: 100 },
      { timestamp: 2, price: 11, average: 10.5, volume: 200 },
    ],
    period: 'timeshare',
    range: { start: 0, end: 2 },
    kBarRects: [
      { x: 0, width: 5 },
      { x: 10, width: 5 },
    ],
    isAsiaMarket: true,
    colorPresetSettings: {},
  })
  return { context, fills }
}

describe('timeshare volume renderer', () => {
  it('uses the dedicated volume palette instead of the timeshare price-line color', () => {
    const renderer = VolumeIndicatorDefinition.rendererFactory({ paneId: 'sub' })
    const { onInstall } = renderer
    if (!onInstall) throw new Error('Volume renderer must expose an install hook')
    onInstall(createMockServiceHost({}))
    const { context, fills } = createContext()

    renderer.draw(context)

    expect(fills).toEqual(['#C2363B66', '#00000066'])
  })
})
