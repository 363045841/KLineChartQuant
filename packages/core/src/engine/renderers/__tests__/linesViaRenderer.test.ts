import { describe, it, expect, vi } from 'vitest'

import type { Renderer } from '../../../rendering/render/Renderer'
import {
  compositeSceneRenderer,
  drawFilledBandViaRenderer,
  drawLinesViaRenderer,
  shouldCompositeSceneRenderer,
  tryDrawFilledBandGpu,
} from '../linesViaRenderer'

function mockRenderer(): Renderer & {
  drawLines: ReturnType<typeof vi.fn>
  createPipeline: ReturnType<typeof vi.fn>
  destroyPipeline: ReturnType<typeof vi.fn>
} {
  return {
    surface: {
      isAvailable: () => true,
      resize: () => {},
      bindRegion: () => true,
      clearRegion: () => {},
      compositeTo: vi.fn(),
      dispose: () => {},
    },
    caps: { compute: false, storageBuffer: false, maxInstances: 1e6, name: 'webgl2' },
    createBuffer: vi.fn(() => ({}) as never),
    writeBuffer: vi.fn(),
    destroyBuffer: vi.fn(),
    createPipeline: vi.fn(() => ({}) as never),
    destroyPipeline: vi.fn(),
    createComputePipeline: () => {
      throw new Error('no')
    },
    destroyComputePipeline: () => {},
    beginFrame: vi.fn(),
    drawInstances: vi.fn(() => true),
    drawLines: vi.fn(() => true),
    dispatchCompute: () => {},
    endFrame: vi.fn(),
    dispose: vi.fn(),
  } as never
}

describe('drawLinesViaRenderer', () => {
  it('issues one batched drawLines with all strips (not N calls)', () => {
    const r = mockRenderer()
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
    expect(args.strips[0].color).toBe('#f00')
    expect(args.strips[1].color).toBe('#0f0')
    expect(args.uniforms.scrollLeft).toBe(10)
  })

  it('returns true without draw when no drawable strips', () => {
    const r = mockRenderer()
    expect(drawLinesViaRenderer(r, [{ points: [{ x: 0, y: 0 }], color: '#f00' }], 0)).toBe(true)
    expect(r.drawLines).not.toHaveBeenCalled()
  })

  it('returns false when drawLines silent-fails', () => {
    const r = mockRenderer()
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
    const r = mockRenderer()
    r.surface.isAvailable = () => false
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

describe('drawFilledBandViaRenderer', () => {
  it('uses fill pipeline and packs upper/lower points', () => {
    const r = mockRenderer()
    r.drawLines.mockReturnValue(true)
    const ok = drawFilledBandViaRenderer(
      r,
      [
        { x: 0, y: 10 },
        { x: 1, y: 12 },
      ],
      [
        { x: 0, y: 20 },
        { x: 1, y: 22 },
      ],
      'rgba(0,0,255,0.2)',
      5,
    )
    expect(ok).toBe(true)
    expect(r.createPipeline).toHaveBeenCalledWith({ type: 'fill' })
    expect(r.drawLines).toHaveBeenCalledTimes(1)
    const args = r.drawLines.mock.calls[0]![0]
    expect(args.vertexCount).toBe(4)
    expect(args.uniforms.color).toBe('rgba(0,0,255,0.2)')
    expect(args.uniforms.scrollLeft).toBe(5)
  })

  it('returns false when fewer than 2 points', () => {
    const r = mockRenderer()
    expect(drawFilledBandViaRenderer(r, [{ x: 0, y: 1 }], [{ x: 0, y: 2 }], '#00f', 0)).toBe(false)
    expect(r.drawLines).not.toHaveBeenCalled()
  })

  it('reuses fill pipeline and vertex buffer across frames', () => {
    const r = mockRenderer()
    r.drawLines.mockReturnValue(true)
    const upper = [
      { x: 0, y: 10 },
      { x: 1, y: 12 },
    ]
    const lower = [
      { x: 0, y: 20 },
      { x: 1, y: 22 },
    ]
    expect(drawFilledBandViaRenderer(r, upper, lower, '#00f', 0)).toBe(true)
    expect(drawFilledBandViaRenderer(r, upper, lower, '#00f', 5)).toBe(true)
    expect(r.createPipeline).toHaveBeenCalledTimes(1)
    expect(r.createBuffer).toHaveBeenCalledTimes(1)
    expect(r.destroyBuffer).not.toHaveBeenCalled()
  })
})

describe('compositeSceneRenderer hybrid DOM', () => {
  it('composites on webgl and skips on webgpu', () => {
    const webgl = mockRenderer()
    const webgpu = mockRenderer()
    ;(webgpu.caps as { name: string }).name = 'webgpu'
    expect(shouldCompositeSceneRenderer(webgl)).toBe(true)
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
    expect(webgl.surface.compositeTo).toHaveBeenCalledOnce()
  })
})

describe('tryDrawFilledBandGpu alpha on hybrid DOM', () => {
  const upper = [
    { x: 0, y: 10 },
    { x: 1, y: 12 },
  ]
  const lower = [
    { x: 0, y: 20 },
    { x: 1, y: 22 },
  ]

  it('webgl keeps opaque color and applies alpha via compositeTo', () => {
    const r = mockRenderer()
    r.drawLines.mockReturnValue(true)
    const ok = tryDrawFilledBandGpu(
      {
        ctx: {} as CanvasRenderingContext2D,
        pane: { top: 0, height: 100 },
        viewport: { plotWidth: 200 },
        paneWidth: 200,
        dpr: 1,
        sceneRenderer: r,
      } as never,
      upper,
      lower,
      'rgba(0, 128, 255, 1)',
      0,
      0.2,
    )
    expect(ok).toBe(true)
    expect(r.drawLines.mock.calls[0]![0].uniforms.color).toBe('rgba(0, 128, 255, 1)')
    expect(r.surface.compositeTo).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ alpha: 0.2 }),
    )
  })

  it('webgpu bakes alpha into fill color and skips compositeTo', () => {
    const r = mockRenderer()
    ;(r.caps as { name: string }).name = 'webgpu'
    r.drawLines.mockReturnValue(true)
    const ok = tryDrawFilledBandGpu(
      {
        ctx: {} as CanvasRenderingContext2D,
        pane: { top: 0, height: 100 },
        viewport: { plotWidth: 200 },
        paneWidth: 200,
        dpr: 1,
        sceneRenderer: r,
      } as never,
      upper,
      lower,
      'rgba(0, 128, 255, 1)',
      0,
      0.2,
    )
    expect(ok).toBe(true)
    expect(r.drawLines.mock.calls[0]![0].uniforms.color).toBe('rgba(0, 128, 255, 0.2)')
    expect(r.surface.compositeTo).not.toHaveBeenCalled()
  })
})
