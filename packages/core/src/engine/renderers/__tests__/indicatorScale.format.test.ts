import { describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockPluginHost,
  createMockRenderContext,
  createMockStateReader,
} from '@/engine/__tests__/helpers/renderTestKit'

import { createIndicatorScaleRendererPlugin } from '../Indicator/scale/indicator_scale'
import { formatScaleValue, resolveAdaptiveDecimals } from '../Indicator/scale/scaleFormat'

describe('resolveAdaptiveDecimals', () => {
  it('keeps the minimum decimals for wide ranges', () => {
    expect(resolveAdaptiveDecimals({ minPrice: 0, maxPrice: 80 })).toBe(2)
  })

  it('grows decimals for sub-unit ranges', () => {
    expect(resolveAdaptiveDecimals({ minPrice: -0.002, maxPrice: 0.002 })).toBe(5)
  })

  it('falls back to minimum decimals for degenerate ranges', () => {
    expect(resolveAdaptiveDecimals({ minPrice: 1, maxPrice: 1 })).toBe(2)
  })
})

describe('formatScaleValue', () => {
  it('normalizes values that round down to zero', () => {
    expect(formatScaleValue(-0.0004, 2)).toBe('0.00')
    expect(formatScaleValue(-0.001, 3)).toBe('-0.001')
  })
})

describe('indicator scale plugin formatting', () => {
  it('renders small-magnitude ticks with adaptive decimals and no negative zero', () => {
    const yAxisCtx = createMockCanvasContext()
    const renderer = createIndicatorScaleRendererPlugin({
      axisWidth: 60,
      paneId: 'sub_MACD_test',
      indicatorKey: 'macd',
      label: 'MACD',
      decimals: 2,
    })
    renderer.onInstall?.(createMockPluginHost())

    renderer.draw(
      createMockRenderContext({
        yAxisCtx,
        dpr: 2,
        pane: {
          id: 'sub_MACD_test',
          height: 160,
          yAxis: {
            getScaleType: () => 'linear',
            getDisplayRange: (range) => range ?? { maxPrice: 0, minPrice: 0 },
            getPaddingTop: () => 0,
            getPaddingBottom: () => 0,
          },
        },
        indicatorStateReader: createMockStateReader('indicator:macd:sub_MACD_test', {
          timestamp: 1,
          valueMin: -0.002,
          valueMax: 0.002,
        }),
        isAsiaMarket: true,
        colorPresetSettings: {},
      }),
    )

    const labels = vi.mocked(yAxisCtx.fillText).mock.calls.map(([text]) => text as string)
    expect(labels.length).toBeGreaterThan(0)
    expect(labels).not.toContain('-0.00')
    expect(labels.some((text) => /\.\d{3,}$/.test(text))).toBe(true)
  })
})
