/** 副图轴标签在独立 overlay 帧中跟随鼠标的回归测试。 */
import { describe, expect, it } from 'vitest'
import {
  createContextWithInstanceState,
  createMockCanvasContext,
} from '@/engine/__tests__/helpers/renderTestKit.js'
import { registerIndicatorLayerNaming } from '@/engine/indicators/indicatorLayerNaming.js'
import { createYAxisOverlayRendererLayer } from '../../../yAxis.js'
import { createIndicatorScaleLayer } from '../indicator_scale.js'

describe('indicator scale crosshair overlay', () => {
  it('updates position and custom text without repainting static ticks, then disappears on pane exit', () => {
    const paneId = 'rsi-pane'
    const instanceId = 'rsi-instance'
    registerIndicatorLayerNaming(
      ['crosshair-test'],
      ({ paneId }) => `${paneId}-renderer`,
      ({ paneId }) => `${paneId}-scale`,
    )
    let pointer = { y: 350, price: 75, activePaneId: paneId }
    const layer = createIndicatorScaleLayer({
      axisWidth: 80,
      paneId,
      instanceId,
      indicatorKey: 'crosshair-test',
      label: 'RSI',
      getCrosshair: () => pointer,
      formatCrosshairLabel: (value) => `${value.toFixed(1)} units`,
    })
    const staticCtx = createMockCanvasContext()
    const dynamicCtx = createMockCanvasContext()
    /** 每次移动模拟新的帧收集器，复用真实的系统动态轴清理流程。 */
    const paintOverlay = () => {
      const context = createContextWithInstanceState(
        dynamicCtx,
        instanceId,
        {
          valueMin: 0,
          valueMax: 100,
        },
        {
          yAxisCtx: staticCtx,
          yAxisOverlayCtx: dynamicCtx,
          pane: {
            id: paneId,
            role: 'indicator',
            top: 300,
            height: 200,
            yAxis: {
              getPaddingTop: () => 0,
              getPaddingBottom: () => 0,
              getDisplayRange: () => ({ minPrice: 0, maxPrice: 100 }),
            },
          },
        },
      )
      createYAxisOverlayRendererLayer({ axisWidth: 80, getCrosshair: () => pointer }).paint(context)
      layer.crosshairLayer.paint(context)
      return context.axisLabels.forSurface('yRightOverlay', paneId).labels
    }

    expect(layer.crosshairLayer.role).toBe('overlay')
    expect(paintOverlay()).toMatchObject([{ pos: 50, text: '75.0 units' }])
    pointer = { ...pointer, y: 450, price: 25 }
    expect(paintOverlay()).toMatchObject([{ pos: 150, text: '25.0 units' }])
    pointer = { ...pointer, activePaneId: 'main' }
    expect(paintOverlay()).toEqual([])
    expect(dynamicCtx.clearRect).toHaveBeenCalledTimes(3)
    expect(staticCtx.clearRect).not.toHaveBeenCalled()
    expect(staticCtx.fillText).not.toHaveBeenCalled()
  })
})
