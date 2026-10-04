import { describe, expect, it } from 'vitest'
import { getPhysicalKLineConfig } from '../../viewport/klineConfig'
import { ScrollCompensator, type ScrollDeps } from '../scrollCompensator'
import { createMockViewport } from './helpers/chartDataManagerTestKit'

/** 用注入的视口几何装配补偿器；数值不依赖任何内容宽度公式。 */
function makeDeps(options: {
  leftBuffer: number
  contentWidth: number
  viewWidth: number
  scrollLeft?: number
}): { deps: ScrollDeps; getScrollLeft: () => number } {
  const { viewport, getScrollLeft } = createMockViewport({
    scrollLeft: options.scrollLeft ?? 0,
    leftLoadBufferWidth: options.leftBuffer,
    contentWidth: options.contentWidth,
    viewWidth: options.viewWidth,
    dpr: 1,
  })
  return {
    deps: { getOption: () => ({ kWidth: 8, kGap: 2 }), viewport },
    getScrollLeft,
  }
}

describe('ScrollCompensator geometry', () => {
  it('scrollToRight clamps the target to the injected maxScrollLeft', () => {
    const dataLength = 200
    const viewWidth = 400
    const leftBuffer = 400
    const contentWidth = 2600
    const { deps, getScrollLeft } = makeDeps({ leftBuffer, contentWidth, viewWidth })

    new ScrollCompensator(deps).scrollToRight(dataLength)

    const { unitPx, startXPx } = getPhysicalKLineConfig(8, 2, 1)
    const rawTarget = leftBuffer + (startXPx + dataLength * unitPx) - viewWidth
    const maxScroll = contentWidth - viewWidth
    expect(getScrollLeft()).toBe(Math.max(0, Math.min(rawTarget, maxScroll)))
  })

  it('reads contentWidth and leftLoadBufferWidth from the viewport, not local formulas', () => {
    const injectedLeft = 111
    const injectedContent = 500
    const viewWidth = 400
    const { deps, getScrollLeft } = makeDeps({
      leftBuffer: injectedLeft,
      contentWidth: injectedContent,
      viewWidth,
    })

    new ScrollCompensator(deps).scrollToRight(50)

    expect(getScrollLeft()).toBe(injectedContent - viewWidth)
  })
})
