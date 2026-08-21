import { describe, expect, it, vi } from 'vitest'

import {
  createVolumeScaleRendererPlugin,
  formatVolumeScaleLabel,
} from '../Indicator/scale/volume_scale'
import type { RenderContext } from '../../../foundation/plugin'

describe('formatVolumeScaleLabel', () => {
  it('keeps small timeshare volumes in their original unit', () => {
    expect(formatVolumeScaleLabel(9_999)).toBe('9999.00')
  })

  it('formats medium and large volumes with meaningful units', () => {
    expect(formatVolumeScaleLabel(25_000)).toBe('2.50万')
    expect(formatVolumeScaleLabel(250_000_000)).toBe('2.50B')
  })

  it('draws ticks from the frame state for a dynamic volume pane', () => {
    const fillText = vi.fn()
    const yAxisCtx = {
      canvas: { width: 120 },
      clearRect: vi.fn(),
      fillText,
      font: '',
      textBaseline: 'alphabetic',
      textAlign: 'start',
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D
    const renderer = createVolumeScaleRendererPlugin({
      axisWidth: 60,
      paneId: 'sub_Volume_dynamic',
    })
    renderer.onInstall?.({} as never)

    renderer.draw({
      yAxisCtx,
      dpr: 2,
      pane: {
        id: 'sub_Volume_dynamic',
        height: 160,
        yAxis: {
          getScaleType: () => 'linear',
          getDisplayRange: (range: { minPrice: number; maxPrice: number }) => range,
          getPaddingTop: () => 0,
          getPaddingBottom: () => 0,
        },
      },
      indicatorStateReader: {
        get: (key: string) =>
          key === 'indicator:volume:sub_Volume_dynamic'
            ? { timestamp: 1, valueMin: 990, valueMax: 1_110 }
            : undefined,
      },
      theme: 'light',
      isAsiaMarket: true,
      colorPresetSettings: {},
    } as unknown as RenderContext)

    expect(fillText).toHaveBeenCalled()
  })
})
