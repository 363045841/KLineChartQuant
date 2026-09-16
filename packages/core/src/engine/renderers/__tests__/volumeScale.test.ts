import { describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockPluginHost,
  createMockRenderContext,
  createMockStateReader,
} from '@/engine/__tests__/helpers/renderTestKit'

import {
  createVolumeScaleRendererPlugin,
  formatVolumeScaleLabel,
} from '../Indicator/scale/volume_scale'

describe('formatVolumeScaleLabel', () => {
  it('keeps small timeshare volumes in their original unit', () => {
    expect(formatVolumeScaleLabel(9_999)).toBe('9999.00')
  })

  it('formats medium and large volumes with meaningful units', () => {
    expect(formatVolumeScaleLabel(25_000)).toBe('2.50万')
    expect(formatVolumeScaleLabel(250_000_000)).toBe('2.50B')
  })

  it('draws ticks from the frame state for a dynamic volume pane', () => {
    const yAxisCtx = createMockCanvasContext()
    const renderer = createVolumeScaleRendererPlugin({
      axisWidth: 60,
      paneId: 'sub_Volume_dynamic',
    })
    renderer.onInstall?.(createMockPluginHost())

    renderer.draw(
      createMockRenderContext({
        yAxisCtx,
        dpr: 2,
        pane: {
          id: 'sub_Volume_dynamic',
          height: 160,
          yAxis: {
            getScaleType: () => 'linear',
            getDisplayRange: (range) => range ?? { maxPrice: 0, minPrice: 0 },
            getPaddingTop: () => 0,
            getPaddingBottom: () => 0,
          },
        },
        indicatorStateReader: createMockStateReader('indicator:volume:sub_Volume_dynamic', {
          timestamp: 1,
          valueMin: 990,
          valueMax: 1_110,
        }),
        isAsiaMarket: true,
        colorPresetSettings: {},
      }),
    )

    expect(vi.mocked(yAxisCtx.fillText)).toHaveBeenCalled()
  })
})
