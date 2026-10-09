// @vitest-environment jsdom
/** 非 Vue 宿主的直接挂载：自建 DOM 骨架、首帧 pane 布局、挂载数据与布局恢复的先后。 */
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCanvasGetContextMock,
  ResizeObserverMock,
  stubAnimationFrame,
} from '@/engine/__tests__/helpers/chartDomTestKit'

import { loadBuiltinIndicators } from '../../engine/indicators/registerBuiltins'
import { createChartController } from '../chart/index'

import type { KLineData } from '../types'

function createBars(length: number): KLineData[] {
  return Array.from({ length }, (_, index) => ({
    timestamp: (index + 1) * 86_400_000,
    open: index + 1,
    high: index + 2,
    low: index,
    close: index + 1,
    volume: 100,
  }))
}

/** jsdom 没有布局：只给自建的绘图区一个尺寸，宿主保持 0，与真实浏览器里 Core 读取的元素一致。 */
function stubPlotSize(width: number, height: number): () => void {
  const proto = HTMLElement.prototype
  const original = {
    clientWidth: Object.getOwnPropertyDescriptor(proto, 'clientWidth'),
    clientHeight: Object.getOwnPropertyDescriptor(proto, 'clientHeight'),
  }
  const sized = (el: HTMLElement) => el.classList.contains('klc-chart-container')
  Object.defineProperty(proto, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return sized(this) ? width : 0
    },
  })
  Object.defineProperty(proto, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return sized(this) ? height : 0
    },
  })
  return () => {
    if (original.clientWidth) Object.defineProperty(proto, 'clientWidth', original.clientWidth)
    if (original.clientHeight) Object.defineProperty(proto, 'clientHeight', original.clientHeight)
  }
}

describe('createChartController direct mount', () => {
  let restoreSize: () => void

  beforeAll(async () => {
    await loadBuiltinIndicators()
  })

  beforeEach(async () => {
    // 布局归档存于 IndexedDB；每个用例从空库开始。
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('@363045841yyt/klinechart-layouts')
      request.onsuccess = request.onerror = request.onblocked = () => resolve()
    })
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    stubAnimationFrame()
    HTMLCanvasElement.prototype.getContext = createCanvasGetContextMock()
    restoreSize = stubPlotSize(800, 600)
  })

  afterEach(() => {
    restoreSize()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it('builds the Vue-equivalent skeleton with the price axis beside the scrolling plot', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const ctrl = await createChartController({ container: host })

    const main = host.firstElementChild as HTMLElement
    expect(main.className).toBe('klc-chart-main')
    expect(main.style.display).toBe('flex')
    const [left, plot, right] = Array.from(main.children) as HTMLElement[]
    expect(left?.className).toBe('klc-left-axis-host')
    expect(plot?.className).toBe('klc-chart-container')
    expect(right?.className).toBe('klc-right-axis-host')
    // 纵向不滚动，避免画布层高度与容器高度互相放大。
    expect(plot?.style.overflowY).toBe('hidden')
    // 绘图区是滚动容器，宿主上的 touch-action 不会传到这里，必须自带。
    expect(plot?.style.touchAction).toBe('none')
    expect(right?.style.touchAction).toBe('none')
    expect(right?.style.flex).toBe('0 0 auto')
    const xAxis = plot?.querySelector<HTMLCanvasElement>('canvas.klc-x-axis-canvas')
    expect(xAxis?.style.position).toBe('absolute')
    expect(xAxis?.style.bottom).toBe('0px')

    ctrl.dispose()
    expect(host.childElementCount).toBe(0)
  })

  it('lays out panes on the first frame without waiting for a ResizeObserver callback', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const ctrl = await createChartController({ container: host, data: createBars(200) })

    // ResizeObserverMock 从不回调；WebKit 的首次回调也因尺寸未变而不触发 resize。
    const mainCanvas = host.querySelector<HTMLCanvasElement>('canvas.main-canvas')
    expect(mainCanvas?.style.height).not.toBe('0px')
    expect(Number.parseFloat(mainCanvas?.style.height ?? '0')).toBeGreaterThan(0)

    ctrl.dispose()
  })

  it('keeps mount data when a stored layout without a symbol is restored', async () => {
    const data = createBars(300)
    const first = document.createElement('div')
    document.body.appendChild(first)
    const ctrlA = await createChartController({ container: first, data })
    expect(ctrlA.getData()).toHaveLength(300)
    ctrlA.dispose()

    // 第二次挂载会恢复第一次保存的布局；其 currentSymbol 为空。
    const second = document.createElement('div')
    document.body.appendChild(second)
    const ctrlB = await createChartController({ container: second, data })
    expect(ctrlB.getData()).toHaveLength(300)
    ctrlB.dispose()
  })
})
