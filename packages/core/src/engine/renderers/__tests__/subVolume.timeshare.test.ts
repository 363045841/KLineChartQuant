import { describe, expect, it, vi } from 'vitest'

import type { RenderContext } from '../../../foundation/plugin/index'
import { VolumeIndicatorDefinition } from '../subVolume'

function createContext(): RenderContext {
  let fillStyle = ''
  const fills: string[] = []
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    fillRect: vi.fn(() => fills.push(fillStyle)),
    get fillStyle() {
      return fillStyle
    },
    set fillStyle(value: string) {
      fillStyle = value
    },
  } as unknown as CanvasRenderingContext2D & { fills: string[] }
  ;(ctx as CanvasRenderingContext2D & { fills: string[] }).fills = fills

  return {
    ctx,
    pane: {
      id: 'sub',
      top: 0,
      height: 100,
      yAxis: {
        getDisplayRange: (range) => range!,
      },
    },
    data: [
      { timestamp: 1, price: 10, average: 10, volume: 100 },
      { timestamp: 2, price: 11, average: 10.5, volume: 200 },
    ],
    period: 'timeshare',
    range: { start: 0, end: 2 },
    scrollLeft: 0,
    dpr: 1,
    kBarRects: [
      { x: 0, width: 5 },
      { x: 10, width: 5 },
    ],
    theme: 'light',
    isAsiaMarket: true,
    colorPresetSettings: {},
  } as unknown as RenderContext
}

describe('timeshare volume renderer', () => {
  it('uses the dedicated volume palette instead of the timeshare price-line color', () => {
    const renderer = VolumeIndicatorDefinition.rendererFactory({ paneId: 'sub' })
    renderer.onInstall({
      getService: () => ({ getIndicatorMetadata: () => ({ stateKey: 'volume' }) }),
      setSharedState: vi.fn(),
    } as never)
    const context = createContext()

    renderer.draw(context)

    const ctx = context.ctx as CanvasRenderingContext2D & { fills: string[] }
    expect(ctx.fills).toEqual(['#C2363B66', '#00000066'])
  })
})
