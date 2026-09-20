import { describe, expect, it } from 'vitest'
import {
  computeContentWidth,
  computeLeftLoadBufferWidth,
  computeMaxScrollLeft,
} from '../../state/contentGeometry'
import { getPhysicalKLineConfig } from '../../utils/klineConfig'
import { ScrollCompensator, type ScrollDeps } from '../scrollCompensator'
import { createMockViewport } from './helpers/chartDataManagerTestKit'

function makeDeps(
  options: {
    scrollLeft?: number
    leftBuffer?: number
    contentWidth?: number
    viewWidth?: number
    dataLength?: number
  } = {},
): { deps: ScrollDeps; getScrollLeft: () => number } {
  const viewWidth = options.viewWidth ?? 800
  const dataLength = options.dataLength ?? 100
  const kWidth = 8
  const kGap = 2
  const dpr = 1
  const period = 'daily'
  const leftBuffer =
    options.leftBuffer ??
    computeLeftLoadBufferWidth({
      viewWidth,
      plotWidth: viewWidth,
      dataLength,
      period,
      dpr,
      kWidth,
      kGap,
    })
  const contentWidth =
    options.contentWidth ??
    computeContentWidth({
      viewWidth,
      plotWidth: viewWidth,
      dataLength,
      period,
      dpr,
      kWidth,
      kGap,
    })

  const { viewport, getScrollLeft } = createMockViewport({
    scrollLeft: options.scrollLeft ?? 0,
    leftLoadBufferWidth: leftBuffer,
    contentWidth,
    viewWidth,
    dpr,
  })

  return {
    deps: {
      getOption: () => ({ kWidth, kGap }),
      viewport,
    },
    getScrollLeft,
  }
}

describe('ScrollCompensator geometry SSOT', () => {
  it('scrollToRight clamps target to maxScrollLeft from injected contentWidth', () => {
    const dataLength = 200
    const viewWidth = 400
    const kWidth = 8
    const kGap = 2
    const dpr = 1
    const leftBuffer = computeLeftLoadBufferWidth({
      viewWidth,
      plotWidth: viewWidth,
      dataLength,
      period: 'daily',
      dpr,
      kWidth,
      kGap,
    })
    const contentWidth = computeContentWidth({
      viewWidth,
      plotWidth: viewWidth,
      dataLength,
      period: 'daily',
      dpr,
      kWidth,
      kGap,
    })
    const maxScroll = computeMaxScrollLeft(contentWidth, viewWidth)

    const { deps, getScrollLeft } = makeDeps({
      scrollLeft: 0,
      leftBuffer,
      contentWidth,
      viewWidth,
      dataLength,
    })
    new ScrollCompensator(deps).scrollToRight(dataLength)
    const scrollLeft = getScrollLeft()

    const { unitPx, startXPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)
    const lastKLineEndPx = (startXPx + dataLength * unitPx) / dpr
    const rawTarget = leftBuffer + (lastKLineEndPx - viewWidth)
    const expected = Math.round(Math.max(0, Math.min(rawTarget, maxScroll)) * dpr) / dpr
    expect(scrollLeft).toBe(expected)
  })

  it('scrollToRight uses viewport contentWidth / leftLoadBufferWidth, not local formulas', () => {
    const injectedLeft = 111
    const injectedContent = 500
    const viewWidth = 400
    const { viewport, getScrollLeft } = createMockViewport({
      scrollLeft: 0,
      leftLoadBufferWidth: injectedLeft,
      contentWidth: injectedContent,
      viewWidth,
      dpr: 1,
    })

    const deps: ScrollDeps = {
      getOption: () => ({ kWidth: 8, kGap: 2 }),
      viewport,
    }

    const compensator = new ScrollCompensator(deps)
    compensator.scrollToRight(50)

    const maxScroll = Math.max(0, injectedContent - viewWidth)
    expect(getScrollLeft()).toBeLessThanOrEqual(maxScroll)
    expect(getScrollLeft()).toBe(maxScroll)
  })

  it('adjustScrollAfterDataChange uses injected left buffer when scrollLeft <= 0', () => {
    const injectedLeft = 640
    const { viewport, getScrollLeft } = createMockViewport({
      scrollLeft: 0,
      leftLoadBufferWidth: injectedLeft,
      contentWidth: 2000,
      viewWidth: 800,
      dpr: 1,
    })
    const deps: ScrollDeps = {
      getOption: () => ({ kWidth: 8, kGap: 2 }),
      viewport,
    }

    new ScrollCompensator(deps).adjustScrollAfterDataChange(10)
    expect(getScrollLeft()).toBe(injectedLeft)
  })
})
