import { describe, expect, it } from 'vitest'

import type { ChartDom, Viewport } from '../../chartTypes'
import { getPhysicalKLineConfig } from '../../utils/klineConfig'
import {
  computeContentWidth,
  computeLeftLoadBufferWidth,
  computeMaxScrollLeft,
} from '../../state/contentGeometry'
import { ScrollCompensator, type ScrollDeps } from '../scrollCompensator'

function makeDom(): ChartDom {
  return {
    container: { clientWidth: 800 } as HTMLDivElement,
    scrollContent: undefined,
  }
}

function makeDeps(options: {
  scrollLeft?: number
  leftBuffer?: number
  contentWidth?: number
  viewWidth?: number
  dataLength?: number
} = {}): { deps: ScrollDeps; getScrollLeft: () => number } {
  let scrollLeft = options.scrollLeft ?? 0
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

  const viewport: Viewport = {
    viewWidth,
    viewHeight: 600,
    plotWidth: viewWidth,
    plotHeight: 600,
    scrollLeft,
    dpr,
  }

  const deps: ScrollDeps = {
    getOption: () => ({ kWidth, kGap }),
    getEffectiveDpr: () => dpr,
    getCachedScrollLeft: () => scrollLeft,
    setScrollLeft: (v) => {
      scrollLeft = v
    },
    getDom: () => makeDom(),
    getObservedSize: () => ({ width: viewWidth, height: 600 }),
    getViewport: () => viewport,
    getLeftLoadBufferWidth: () => leftBuffer,
    getContentWidth: () => contentWidth,
  }

  return {
    deps,
    getScrollLeft: () => scrollLeft,
  }
}

describe('ScrollCompensator geometry SSOT', () => {
  it('scrollToRight clamps target to maxScrollLeft from injected contentWidth', () => {
    const dataLength = 200
    const viewWidth = 400
    const kWidth = 8
    const kGap = 2
    const dpr = 1
    const input = {
      viewWidth,
      plotWidth: viewWidth,
      dataLength,
      period: 'daily',
      dpr,
      kWidth,
      kGap,
    }
    const leftBuffer = computeLeftLoadBufferWidth(input)
    const contentWidth = computeContentWidth(input)
    const maxScroll = computeMaxScrollLeft(contentWidth, viewWidth)

    const { deps, getScrollLeft } = makeDeps({
      viewWidth,
      dataLength,
      leftBuffer,
      contentWidth,
      scrollLeft: 0,
    })

    const compensator = new ScrollCompensator(deps)
    compensator.scrollToRight(dataLength)

    const scrollLeft = getScrollLeft()
    expect(scrollLeft).toBeLessThanOrEqual(maxScroll)
    expect(scrollLeft).toBeGreaterThanOrEqual(0)

    // target 计算应与 clamp 后一致（数据足够长时贴右）
    const { unitPx, startXPx } = getPhysicalKLineConfig(kWidth, kGap, dpr)
    const lastKLineEndPx = (startXPx + dataLength * unitPx) / dpr
    const rawTarget = leftBuffer + (lastKLineEndPx - viewWidth)
    const expected = Math.round(Math.max(0, Math.min(rawTarget, maxScroll)) * dpr) / dpr
    expect(scrollLeft).toBe(expected)
  })

  it('scrollToRight uses deps.getContentWidth / getLeftLoadBufferWidth, not local formulas', () => {
    const injectedLeft = 111
    const injectedContent = 500
    const viewWidth = 400
    let scrollLeft = 0

    const deps: ScrollDeps = {
      getOption: () => ({ kWidth: 8, kGap: 2 }),
      getEffectiveDpr: () => 1,
      getCachedScrollLeft: () => scrollLeft,
      setScrollLeft: (v) => {
        scrollLeft = v
      },
      getDom: () => makeDom(),
      getObservedSize: () => ({ width: viewWidth, height: 600 }),
      getViewport: () => ({
        viewWidth,
        viewHeight: 600,
        plotWidth: viewWidth,
        plotHeight: 600,
        scrollLeft: 0,
        dpr: 1,
      }),
      getLeftLoadBufferWidth: () => injectedLeft,
      getContentWidth: () => injectedContent,
    }

    const compensator = new ScrollCompensator(deps)
    compensator.scrollToRight(50)

    const maxScroll = Math.max(0, injectedContent - viewWidth)
    expect(scrollLeft).toBeLessThanOrEqual(maxScroll)
    // leftBuffer 来自注入值，目标会基于 111 计算并 clamp
    expect(scrollLeft).toBe(maxScroll)
  })

  it('adjustScrollAfterDataChange uses injected left buffer when scrollLeft <= 0', () => {
    let scrollLeft = 0
    const injectedLeft = 640
    const deps: ScrollDeps = {
      getOption: () => ({ kWidth: 8, kGap: 2 }),
      getEffectiveDpr: () => 1,
      getCachedScrollLeft: () => scrollLeft,
      setScrollLeft: (v) => {
        scrollLeft = v
      },
      getDom: () => makeDom(),
      getObservedSize: () => ({ width: 800, height: 600 }),
      getViewport: () => null,
      getLeftLoadBufferWidth: () => injectedLeft,
      getContentWidth: () => 2000,
    }

    new ScrollCompensator(deps).adjustScrollAfterDataChange(10)
    expect(scrollLeft).toBe(injectedLeft)
  })
})
