/**
 * ChartDataManager / ScrollCompensator 测试共享夹具：ViewportStateModule 替身、
 * DataDependencies 工厂与 JSDOM 容器。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 *
 * 约束：ViewportStateModule 成员众多且与本组用例无关，替身只实现被消费的 readonly/actions，
 * 唯一一处集中强转在本文件内；JSDOM 与 ChartDom 用真实 DOM API 构造。
 */
import { JSDOM } from 'jsdom'
import { vi } from 'vitest'

import type { SymbolSpec } from '@/controllers/types'
import type { ChartDom } from '@/engine/chartTypes'
import type { DataDependencies } from '@/engine/data/chartDataManager'
import { createComparisonState } from '@/engine/state/comparisonState'
import type { ViewportStateModule } from '@/engine/state/viewportState'
import { createSignal } from '@/foundation/reactivity/signal'

/** ViewportStateModule 替身入参。 */
export interface MockViewportOptions {
  scrollLeft?: number
  leftLoadBufferWidth?: number
  contentWidth?: number
  viewWidth?: number
  viewHeight?: number
  dpr?: number
  visibleRange?: { start: number; end: number }
}

/** ViewportStateModule 替身与其滚动量读取器。 */
export interface MockViewport {
  viewport: ViewportStateModule
  getScrollLeft: () => number
}

/** 构造只实现被消费字段的 ViewportStateModule 替身；actions.scrollTo 会更新内部滚动量。 */
export function createMockViewport(options: MockViewportOptions = {}): MockViewport {
  const {
    scrollLeft: initialScrollLeft = 0,
    leftLoadBufferWidth = 800,
    contentWidth = 1600,
    viewWidth = 800,
    viewHeight = 600,
    dpr = 1,
    visibleRange = { start: 0, end: 0 },
  } = options
  let scrollLeft = initialScrollLeft

  const viewport = {
    readonly: {
      dpr: { peek: () => dpr },
      scrollLeft: { peek: () => scrollLeft },
      scrollLeftLogical: { peek: () => scrollLeft },
      leftLoadBufferWidth: { peek: () => leftLoadBufferWidth },
      contentWidth: { peek: () => contentWidth },
      viewWidth: { peek: () => viewWidth },
      viewHeight: { peek: () => viewHeight },
      visibleRange: { peek: () => visibleRange },
      rawVisibleRange: { peek: () => visibleRange },
      viewport: {
        peek: () => ({
          viewWidth,
          viewHeight,
          plotWidth: viewWidth,
          plotHeight: viewHeight,
          scrollLeft,
          dpr,
        }),
      },
    },
    actions: {
      scrollTo: (value: number) => {
        scrollLeft = value
      },
    },
  } as unknown as ViewportStateModule

  return { viewport, getScrollLeft: () => scrollLeft }
}

/** DataDependencies 工厂入参。 */
export interface MockDataDependenciesOptions {
  /** 透传给 createMockViewport 的差异项。 */
  viewport?: MockViewportOptions
  /** 加载完成后的重绘回调。 */
  scheduleDraw?: () => void
}

/** 构造最小可用的 DataDependencies，只声明用例关心的差异。 */
export function createMockDataDependencies(
  dom: ChartDom,
  setSymbols: (symbols: ReadonlyArray<SymbolSpec>) => void,
  options: MockDataDependenciesOptions = {},
): DataDependencies {
  const { viewport, scheduleDraw = () => {} } = options
  return {
    getOption: () => ({ kWidth: 8, kGap: 2 }),
    getZoomLevel: () => 1,
    setZoomLevel: () => {},
    getDom: () => dom,
    viewport: createMockViewport(viewport).viewport,
    comparison: createComparisonState(),
    scheduleDraw,
    resetInteraction: () => {},
    getIndicatorScheduler: () => ({
      update: () => true,
      busySignal: createSignal(false),
    }),
    isPointerDown: () => false,
    onTimeShareDataReady: () => {},
    setSymbols,
  }
}

/** 创建测试用 JSDOM Document，并把其 window 注入全局。 */
export function createTestDocument(): Document {
  const dom = new JSDOM('<div id="container"><div id="scroll-content"></div></div>')
  vi.stubGlobal('window', dom.window)
  return dom.window.document
}

/** 从测试 Document 构造 ChartDom。 */
export function createChartDom(document: Document): ChartDom {
  return {
    container: document.querySelector<HTMLDivElement>('#container')!,
    scrollContent: document.querySelector<HTMLDivElement>('#scroll-content')!,
    canvasLayer: document.createElement('div'),
    rightAxisLayer: document.createElement('div'),
    xAxisCanvas: document.createElement('canvas'),
  }
}
