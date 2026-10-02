import { describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockRenderContext,
  createMockStateReader,
} from '@/engine/__tests__/helpers/renderTestKit'

import { createVolumeScaleLayer, formatVolumeScaleLabel } from '../Indicator/scale/volume_scale'

/** 坐标轴按实例身份寻址。 */
const VOLUME_INSTANCE_ID = 'inst-volume-dynamic'

describe('formatVolumeScaleLabel', () => {
  it('keeps small timeshare volumes in their original unit', () => {
    expect(formatVolumeScaleLabel(999)).toBe('999.00')
  })

  it('formats medium and large volumes with meaningful units', () => {
    expect(formatVolumeScaleLabel(1_000)).toBe('1.00K')
    expect(formatVolumeScaleLabel(25_000)).toBe('25.00K')
    expect(formatVolumeScaleLabel(1_000_000)).toBe('1.00M')
    expect(formatVolumeScaleLabel(250_000_000)).toBe('250.00M')
    expect(formatVolumeScaleLabel(1_000_000_000)).toBe('1.00B')
  })

  it('draws ticks from the frame state for a dynamic volume pane', () => {
    const yAxisCtx = createMockCanvasContext()
    const layer = createVolumeScaleLayer({
      axisWidth: 60,
      paneId: 'sub_Volume_dynamic',
      instanceId: VOLUME_INSTANCE_ID,
    })

    layer.paint(
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
        indicatorStateReader: createMockStateReader(VOLUME_INSTANCE_ID, {
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
