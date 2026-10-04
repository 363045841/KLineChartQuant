/** 公共矩形绘制的后端契约与异常资源释放验证。 */
import { describe, expect, it, vi } from 'vitest'

import { createMockRenderer } from '@/rendering/render/__tests__/helpers/rendererTestKit'

import {
  createMockCanvasContext,
  createMockRenderContext,
} from '../../__tests__/helpers/renderTestKit'
import { drawRectBatchesViaRenderer, drawWorldRectBatches } from '../rectsViaRenderer'

describe('drawRectBatchesViaRenderer', () => {
  it('releases the instance buffer when drawing throws', () => {
    const renderer = createMockRenderer()
    renderer.drawInstances.mockImplementation(() => {
      throw new Error('draw failed')
    })
    expect(
      drawRectBatchesViaRenderer(renderer, [
        { buf: new Float32Array([0, 0, 1, 1]), count: 1, color: '#0f0' },
      ]),
    ).toBe(false)
    expect(renderer.destroyBuffer).toHaveBeenCalledOnce()
  })

  it('Canvas2D and Renderer use the same physical pixel geometry', () => {
    const renderer = createMockRenderer()
    const canvas = createMockCanvasContext()
    const context = createMockRenderContext({ ctx: canvas, dpr: 1.25, scrollLeft: 79.6 })
    const batches = [{ buf: new Float64Array([79.2, 10.4, 8.8, 20.8]), count: 1, color: '#0f0' }]
    drawWorldRectBatches(context, batches)
    drawWorldRectBatches({ ...context, sceneRenderer: renderer }, batches)
    const uploaded = renderer.writeBuffer.mock.calls[0]?.[1]
    if (!(uploaded instanceof Float32Array)) throw new Error('Missing screen geometry')
    const rectangle = vi.mocked(canvas.fillRect).mock.calls[0]!
    expect(Array.from(uploaded)).toEqual(rectangle.map((value) => value * context.dpr))
    expect(renderer.drawInstances.mock.calls[0]?.[0].physicalPixels).toBe(true)
  })

  it('draws each non-empty batch via drawInstances', () => {
    const r = createMockRenderer()
    const ok = drawRectBatchesViaRenderer(r, [
      { buf: new Float32Array([0, 0, 10, 20]), count: 1, color: '#0f0' },
      { buf: new Float32Array(0), count: 0, color: '#f00' },
      { buf: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]), count: 2, color: '#00f' },
    ])
    expect(ok).toBe(true)
    expect(r.drawInstances).toHaveBeenCalledTimes(2)
  })

  it('returns false when any batch fails', () => {
    const r = createMockRenderer()
    r.drawInstances.mockReturnValueOnce(true).mockReturnValueOnce(false)
    expect(
      drawRectBatchesViaRenderer(r, [
        { buf: new Float32Array([0, 0, 1, 1]), count: 1, color: '#0f0' },
        { buf: new Float32Array([0, 0, 1, 1]), count: 1, color: '#f00' },
      ]),
    ).toBe(false)
  })

  it('returns true when all counts are zero', () => {
    const r = createMockRenderer()
    expect(
      drawRectBatchesViaRenderer(r, [{ buf: new Float32Array(0), count: 0, color: '#0f0' }]),
    ).toBe(true)
    expect(r.drawInstances).not.toHaveBeenCalled()
  })

  it('caches pipeline and unit vertex buffer; creates + destroys instance buffer per batch', () => {
    const r = createMockRenderer()
    const batches = [{ buf: new Float32Array([0, 0, 10, 20]), count: 1, color: '#0f0' }]
    expect(drawRectBatchesViaRenderer(r, batches)).toBe(true)
    expect(drawRectBatchesViaRenderer(r, batches)).toBe(true)
    expect(r.createPipeline).toHaveBeenCalledTimes(1)
    // unit buffer created once; each batch creates its own instance buffer
    expect(r.createBuffer).toHaveBeenCalledTimes(3)
    expect(r.destroyBuffer).toHaveBeenCalledTimes(2)
  })
})
