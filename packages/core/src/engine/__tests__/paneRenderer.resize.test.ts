// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Pane } from '@/core/layout/pane'
import { PaneRenderer } from '@/core/paneRenderer'
import { SharedWebGLSurface } from '@/core/renderers/webgl/sharedWebGLSurface'

describe('PaneRenderer resize DPR mapping', () => {
  it('maps logical plot size to physical canvas size and keeps CSS size logical', () => {
    const mainCanvas = document.createElement('canvas')
    const overlayCanvas = document.createElement('canvas')
    const yAxisCanvas = document.createElement('canvas')
    const pane = new Pane('main')
    const sharedWebGLSurface = new SharedWebGLSurface()
    const renderer = new PaneRenderer(
      { mainCanvas, overlayCanvas, yAxisCanvas },
      pane,
      {
        rightAxisWidth: 80,
        yPaddingPx: 0,
        priceLabelWidth: 60,
      },
      sharedWebGLSurface,
    )

    renderer.resize(500, 240, 2)

    expect(mainCanvas.width).toBe(Math.round(500 * 2))
    expect(mainCanvas.height).toBe(Math.round(240 * 2))
    expect(mainCanvas.style.width).toBe('500px')
    expect(mainCanvas.style.height).toBe('240px')
    // overlayCanvas should match mainCanvas
    expect(overlayCanvas.width).toBe(mainCanvas.width)
    expect(overlayCanvas.height).toBe(mainCanvas.height)
  })

  it('uses (rightAxisWidth + priceLabelWidth) for yAxis physical width when no parent width is available', () => {
    const mainCanvas = document.createElement('canvas')
    const overlayCanvas = document.createElement('canvas')
    const yAxisCanvas = document.createElement('canvas')
    const pane = new Pane('main')
    const sharedWebGLSurface = new SharedWebGLSurface()
    const renderer = new PaneRenderer(
      { mainCanvas, overlayCanvas, yAxisCanvas },
      pane,
      {
        rightAxisWidth: 100,
        yPaddingPx: 0,
        priceLabelWidth: 70,
      },
      sharedWebGLSurface,
    )

    renderer.resize(500, 200, 1.5)

    expect(yAxisCanvas.width).toBe(Math.round((100 + 70) * 1.5))
    expect(yAxisCanvas.height).toBe(Math.round(200 * 1.5))
    expect(yAxisCanvas.style.width).toBe('170px')
    expect(yAxisCanvas.style.height).toBe('200px')
  })

  it('uses parent clientWidth for yAxis canvas width when available', () => {
    const host = document.createElement('div')
    Object.defineProperty(host, 'clientWidth', {
      value: 168,
      configurable: true,
    })

    const mainCanvas = document.createElement('canvas')
    const overlayCanvas = document.createElement('canvas')
    const yAxisCanvas = document.createElement('canvas')
    host.appendChild(yAxisCanvas)

    const pane = new Pane('main')
    const sharedWebGLSurface = new SharedWebGLSurface()
    const renderer = new PaneRenderer(
      { mainCanvas, overlayCanvas, yAxisCanvas },
      pane,
      {
        rightAxisWidth: 100,
        yPaddingPx: 0,
        priceLabelWidth: 70,
      },
      sharedWebGLSurface,
    )

    renderer.resize(500, 200, 1.5)

    expect(yAxisCanvas.width).toBe(Math.round(168 * 1.5))
    expect(yAxisCanvas.height).toBe(Math.round(200 * 1.5))
    expect(yAxisCanvas.style.width).toBe('168px')
    expect(yAxisCanvas.style.height).toBe('200px')
  })
})
