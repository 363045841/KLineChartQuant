// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { Pane } from '@/core/layout/pane'
import { PaneRenderer } from '@/core/paneRenderer'

function createDom() {
  return {
    mainCanvas: document.createElement('canvas'),
    overlayCanvas: document.createElement('canvas'),
    yAxisCanvas: document.createElement('canvas'),
    yAxisOverlayCanvas: document.createElement('canvas'),
  }
}

describe('PaneRenderer resize DPR mapping', () => {
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
