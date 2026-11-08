// @vitest-environment jsdom
// 验证 Pane 画布尺寸、轴宽与 DPR 映射。
import { describe, expect, it } from 'vitest'
import { Pane, PaneRenderer } from '@/core/pane/index'

/** 构造含左右轴的真实 DOM 画布。 */
function createDom() {
  return {
    mainCanvas: document.createElement('canvas'),
    drawingCanvas: document.createElement('canvas'),
    overlayCanvas: document.createElement('canvas'),
    yAxisCanvas: document.createElement('canvas'),
    yAxisOverlayCanvas: document.createElement('canvas'),
    leftYAxisCanvas: document.createElement('canvas'),
    leftYAxisOverlayCanvas: document.createElement('canvas'),
  }
}

describe('PaneRenderer resize DPR mapping', () => {
  it('releases an empty overlay and restores its current DPR size when content returns', () => {
    const dom = createDom()
    const renderer = new PaneRenderer(dom, new Pane('main'), {
      rightAxisWidth: 60,
      leftAxisWidth: 0,
      priceLabelWidth: 60,
      yPaddingPx: 0,
    })
    renderer.resize(500, 240, 1.5)
    renderer.setOverlayRasterRequired(false)
    expect(dom.overlayCanvas.width).toBe(0)
    expect(dom.overlayCanvas.height).toBe(0)
    expect(dom.overlayCanvas.style.width).toBe('500px')
    renderer.resize(400, 200, 2)
    expect(dom.overlayCanvas.width).toBe(0)
    renderer.setOverlayRasterRequired(true)
    expect(dom.overlayCanvas.width).toBe(800)
    expect(dom.overlayCanvas.height).toBe(400)
    renderer.destroy()
  })

  it('releases only main raster pixels in GPU mode and restores current layout for Canvas', () => {
    const dom = createDom()
    const renderer = new PaneRenderer(dom, new Pane('main'), {
      rightAxisWidth: 60,
      leftAxisWidth: 0,
      priceLabelWidth: 60,
      yPaddingPx: 0,
    })
    renderer.resize(500, 240, 1.5)
    renderer.setMainRasterRequired(false)
    expect(dom.mainCanvas.width).toBe(0)
    expect(dom.mainCanvas.height).toBe(0)
    expect(dom.mainCanvas.style.width).toBe('500px')
    expect(dom.overlayCanvas.width).toBe(750)
    renderer.resize(400, 200, 2)
    expect(dom.mainCanvas.width).toBe(0)
    renderer.setMainRasterRequired(true)
    expect(dom.mainCanvas.width).toBe(800)
    expect(dom.mainCanvas.height).toBe(400)
    expect(dom.mainCanvas.style.height).toBe('200px')
    renderer.destroy()
  })

  it('keeps the left axis visible when axis width is supplied only by price labels', () => {
    const dom = createDom()
    const renderer = new PaneRenderer(dom, new Pane('main'), {
      rightAxisWidth: 0,
      leftAxisWidth: 0,
      priceLabelWidth: 60,
      yPaddingPx: 0,
    })
    renderer.resize(500, 240, 2)
    expect(dom.leftYAxisCanvas.width).toBe(120)
    expect(dom.leftYAxisCanvas.style.width).toBe('60px')
    expect(dom.leftYAxisOverlayCanvas.width).toBe(120)
    expect(dom.leftYAxisCanvas.height).toBe(480)
  })

  it('maps logical plot size to physical canvas size and keeps CSS size logical', () => {
    const dom = createDom()
    const pane = new Pane('main')
    const renderer = new PaneRenderer(dom, pane, {
      rightAxisWidth: 80,
      leftAxisWidth: 60,
      yPaddingPx: 0,
      priceLabelWidth: 60,
    })

    renderer.resize(500, 240, 2)

    expect(dom.mainCanvas.width).toBe(Math.round(500 * 2))
    expect(dom.mainCanvas.height).toBe(Math.round(240 * 2))
    expect(dom.mainCanvas.style.width).toBe('500px')
    expect(dom.mainCanvas.style.height).toBe('240px')
    // overlayCanvas should match mainCanvas
    expect(dom.overlayCanvas.width).toBe(dom.mainCanvas.width)
    expect(dom.overlayCanvas.height).toBe(dom.mainCanvas.height)
    expect(dom.drawingCanvas.width).toBe(dom.mainCanvas.width)
    expect(dom.drawingCanvas.height).toBe(dom.mainCanvas.height)
    expect(dom.drawingCanvas.style.width).toBe('500px')
    expect(dom.drawingCanvas.style.height).toBe('240px')
    // yAxis overlay matches yAxis base
    expect(dom.yAxisOverlayCanvas.width).toBe(dom.yAxisCanvas.width)
    expect(dom.yAxisOverlayCanvas.height).toBe(dom.yAxisCanvas.height)
  })

  it('uses (rightAxisWidth + priceLabelWidth) for yAxis physical width when no parent width is available', () => {
    const dom = createDom()
    const pane = new Pane('main')
    const renderer = new PaneRenderer(dom, pane, {
      rightAxisWidth: 100,
      leftAxisWidth: 60,
      yPaddingPx: 0,
      priceLabelWidth: 70,
    })

    renderer.resize(500, 200, 1.5)

    expect(dom.yAxisCanvas.width).toBe(Math.round((100 + 70) * 1.5))
    expect(dom.yAxisCanvas.height).toBe(Math.round(200 * 1.5))
    expect(dom.yAxisCanvas.style.width).toBe('170px')
    expect(dom.yAxisCanvas.style.height).toBe('200px')
    expect(dom.yAxisOverlayCanvas.width).toBe(dom.yAxisCanvas.width)
    expect(dom.yAxisOverlayCanvas.height).toBe(dom.yAxisCanvas.height)
  })

  it('uses parent clientWidth for yAxis canvas width when available', () => {
    const host = document.createElement('div')
    Object.defineProperty(host, 'clientWidth', {
      value: 168,
      configurable: true,
    })

    const dom = createDom()
    host.appendChild(dom.yAxisCanvas)
    host.appendChild(dom.yAxisOverlayCanvas)

    const pane = new Pane('main')
    const renderer = new PaneRenderer(dom, pane, {
      rightAxisWidth: 100,
      leftAxisWidth: 60,
      yPaddingPx: 0,
      priceLabelWidth: 70,
    })

    renderer.resize(500, 200, 1.5)

    expect(dom.yAxisCanvas.width).toBe(Math.round(168 * 1.5))
    expect(dom.yAxisCanvas.height).toBe(Math.round(200 * 1.5))
    expect(dom.yAxisCanvas.style.width).toBe('168px')
    expect(dom.yAxisCanvas.style.height).toBe('200px')
    expect(dom.yAxisOverlayCanvas.width).toBe(dom.yAxisCanvas.width)
  })
})
