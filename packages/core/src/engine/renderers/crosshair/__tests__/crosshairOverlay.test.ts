/** 验证图表级十字线的完整路径、像素尺寸与生命周期。 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMockCanvasContext,
  createMockPaneInfo,
} from '@/engine/__tests__/helpers/renderTestKit'
import { CrosshairOverlay } from '../impl/crosshairOverlay'
import type { CrosshairOverlayFrame } from '../types'

afterEach(() => vi.restoreAllMocks())

/** 复用共享 Canvas 替身，并观察真实 DOM 表面的尺寸与释放。 */
function createFixture() {
  const ctx = createMockCanvasContext()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
  const host = document.createElement('div')
  const overlay = new CrosshairOverlay(host)
  /** 表面在十字线首次出现时创建，按需读取。 */
  const surface = (): HTMLCanvasElement => {
    const canvas = host.querySelector('canvas')
    if (!canvas) throw new Error('missing crosshair canvas')
    return canvas
  }
  const frame: CrosshairOverlayFrame = {
    viewport: { plotWidth: 800, plotHeight: 600, dpr: 1 },
    pos: { x: 31.2, y: 250 },
    price: 4.38,
    activePane: createMockPaneInfo({ top: 200, height: 200 }),
    color: '',
  }
  return { ctx, host, overlay, surface, frame }
}

describe('CrosshairOverlay', () => {
  it.each([1, 1.25, 2])(
    'leaves a symmetric center gap around the global price point at DPR %s',
    (dpr) => {
      const { ctx, overlay, surface, frame } = createFixture()
      frame.viewport.dpr = dpr
      overlay.paint(frame)
      const canvas = surface()
      const origin = {
        x: (Math.floor(31.2 * dpr) + 0.5) / dpr,
        y: (Math.floor(243.8 * dpr) + 0.5) / dpr,
      }
      const gap = Math.ceil(2 * dpr) / dpr
      expect(ctx.dashedPaths).toEqual([
        [
          { x: origin.x, y: origin.y - gap },
          { x: origin.x, y: 0 },
        ],
        [
          { x: origin.x, y: origin.y + gap },
          { x: origin.x, y: 600 },
        ],
        [
          { x: origin.x - gap, y: origin.y },
          { x: 0, y: origin.y },
        ],
        [
          { x: origin.x + gap, y: origin.y },
          { x: 800, y: origin.y },
        ],
      ])
      expect(ctx.rect).toHaveBeenCalledWith(0, 200, 800, 200)
      expect(ctx.strokeLineWidths).toEqual(Array(4).fill(1 / dpr))
      expect(canvas.width).toBe(800 * dpr)
      expect(canvas.height).toBe(600 * dpr)
      expect(canvas.style.pointerEvents).toBe('none')
    },
  )

  it('updates physical and CSS dimensions on resize and clears when the pointer leaves', () => {
    const { ctx, overlay, surface, frame } = createFixture()
    overlay.paint(frame)
    const canvas = surface()
    frame.viewport = { plotWidth: 480, plotHeight: 320, dpr: 2 }
    frame.pos = null
    overlay.paint(frame)
    expect(canvas.width).toBe(960)
    expect(canvas.height).toBe(640)
    expect(canvas.style.width).toBe('480px')
    expect(canvas.style.height).toBe('320px')
    expect(ctx.clearRect).toHaveBeenLastCalledWith(0, 0, 960, 640)
    expect(ctx.strokedPaths).toHaveLength(4)
  })

  it('uses the global pointer when no active pane exists and releases its owned surface', () => {
    const { ctx, overlay, host, surface, frame } = createFixture()
    frame.activePane = null
    overlay.paint(frame)
    const canvas = surface()
    expect(ctx.dashedPaths).toEqual([
      [
        { x: 31.5, y: 248.5 },
        { x: 31.5, y: 0 },
      ],
      [
        { x: 31.5, y: 252.5 },
        { x: 31.5, y: 600 },
      ],
    ])
    overlay.dispose()
    expect(host.childElementCount).toBe(0)
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })

  it('allocates no surface until the crosshair first appears', () => {
    const { overlay, host, surface, frame } = createFixture()
    frame.pos = null
    overlay.paint(frame)
    overlay.clear()
    expect(host.querySelector('canvas')).toBeNull()
    frame.pos = { x: 10, y: 10 }
    overlay.paint(frame)
    expect(surface().width).toBe(800)
    overlay.dispose()
    overlay.dispose()
    expect(host.childElementCount).toBe(0)
  })
})
