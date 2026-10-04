/** 验证轴标签单帧聚合的表面隔离、共享与统一注册入口。 */
import { describe, expect, it } from 'vitest'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'
import type { AxisTickLabel } from '@/foundation/plugin'
import { createAxisLabelsFrame, registerAxisLabel } from '../index'

/** 最小刻度标签素材。 */
function tick(text: string): AxisTickLabel {
  return { kind: 'tick', text, pos: 0, color: '#000' }
}

describe('createAxisLabelsFrame', () => {
  it('keeps Y surfaces isolated per pane', () => {
    const frame = createAxisLabelsFrame()
    frame.forSurface('yRightStatic', 'main').register(tick('10'))
    frame.forSurface('yRightStatic', 'volume').register(tick('2'))

    expect(frame.forSurface('yRightStatic', 'main').labels).toEqual([tick('10')])
    expect(frame.forSurface('yRightStatic', 'volume').labels).toEqual([tick('2')])
  })

  it('returns the same collector for a repeated (surface, paneId)', () => {
    const frame = createAxisLabelsFrame()
    expect(frame.forSurface('yRightOverlay', 'main')).toBe(
      frame.forSurface('yRightOverlay', 'main'),
    )
  })

  it('shares X surfaces across panes regardless of paneId', () => {
    const frame = createAxisLabelsFrame()
    expect(frame.forSurface('xTicks', 'main')).toBe(frame.forSurface('xTicks', 'volume'))

    frame.forSurface('xTicks', 'main').register(tick('09:30'))
    expect(frame.forSurface('xTicks', 'volume').labels).toEqual([tick('09:30')])
  })
})

describe('registerAxisLabel', () => {
  it('writes X labels to the shared surface', () => {
    const context = createMockRenderContext()

    registerAxisLabel(context, 'xTicks', tick('09:30'))

    expect(context.axisLabels.forSurface('xTicks').labels).toEqual([tick('09:30')])
  })

  it('writes Y labels to the current pane surface', () => {
    const context = createMockRenderContext({ pane: { id: 'sub' } })

    registerAxisLabel(context, 'yRightStatic', tick('5'))

    expect(context.axisLabels.forSurface('yRightStatic', 'sub').labels).toEqual([tick('5')])
    expect(context.axisLabels.forSurface('yRightStatic', 'main').labels).toEqual([])
  })

  it('honors an explicit paneId override', () => {
    const context = createMockRenderContext({ pane: { id: 'sub' } })

    registerAxisLabel(context, 'yLeftOverlay', tick('1'), 'main')

    expect(context.axisLabels.forSurface('yLeftOverlay', 'main').labels).toEqual([tick('1')])
  })
})
