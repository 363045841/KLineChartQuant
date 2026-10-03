import { describe, expect, it } from 'vitest'

import { createMockRenderer } from '@/rendering/render/__tests__/helpers/rendererTestKit'

import {
  compositeSceneRenderer,
  drawLinesViaRenderer,
  shouldCompositeSceneRenderer,
} from '../linesViaRenderer'

describe('drawLinesViaRenderer', () => {
  it('issues one batched drawLines with all strips (not N calls)', () => {
    const r = createMockRenderer()
    const ok = drawLinesViaRenderer(
      r,
      [
        {
          points: [
            { x: 0, y: 1 },
            { x: 2, y: 3 },
          ],
          color: '#f00',
          width: 1,
        },
        {
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 2, y: 0 },
          ],
          color: '#0f0',
        },
      ],
      10,
    )
    expect(ok).toBe(true)
    expect(r.drawLines).toHaveBeenCalledTimes(1)
    const args = r.drawLines.mock.calls[0]![0]
    expect(args.strips).toHaveLength(2)
    expect(args.strips![0]!.color).toBe('#f00')
    expect(args.strips![1]!.color).toBe('#0f0')
    expect(args.uniforms!.scrollLeft).toBe(10)
  })

  it('returns true without draw when no drawable strips', () => {
    const r = createMockRenderer()
    expect(drawLinesViaRenderer(r, [{ points: [{ x: 0, y: 0 }], color: '#f00' }], 0)).toBe(true)
    expect(r.drawLines).not.toHaveBeenCalled()
  })

  it('returns false when drawLines silent-fails', () => {
    const r = createMockRenderer()
    r.drawLines.mockReturnValue(false)
    expect(
      drawLinesViaRenderer(
        r,
        [
          {
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            color: '#f00',
          },
        ],
        0,
      ),
    ).toBe(false)
  })

  it('returns false when surface unavailable', () => {
    const r = createMockRenderer()
    r.surface.isAvailable.mockReturnValue(false)
    expect(
      drawLinesViaRenderer(
        r,
        [
          {
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            color: '#f00',
          },
        ],
        0,
      ),
    ).toBe(false)
  })
})

describe('compositeSceneRenderer hybrid DOM', () => {
  it('skips composite for visible GPU canvases', () => {
    const webgl = createMockRenderer()
    const webgpu = createMockRenderer({ capsName: 'webgpu' })
    expect(shouldCompositeSceneRenderer(webgl)).toBe(false)
    expect(shouldCompositeSceneRenderer(webgpu)).toBe(false)

    compositeSceneRenderer({
      ctx: {} as CanvasRenderingContext2D,
      pane: { top: 0, height: 100 },
      viewport: { plotWidth: 200 },
      paneWidth: 200,
      dpr: 1,
      sceneRenderer: webgpu,
    })
    expect(webgpu.surface.compositeTo).not.toHaveBeenCalled()

    compositeSceneRenderer({
      ctx: {} as CanvasRenderingContext2D,
      pane: { top: 0, height: 100 },
      viewport: { plotWidth: 200 },
      paneWidth: 200,
      dpr: 1,
      sceneRenderer: webgl,
    })
    expect(webgl.surface.compositeTo).not.toHaveBeenCalled()
  })
})
