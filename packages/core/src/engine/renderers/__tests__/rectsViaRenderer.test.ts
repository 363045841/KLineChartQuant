import { describe, expect, it } from 'vitest'

import { createMockRenderer } from '@/rendering/render/__tests__/helpers/rendererTestKit'

import { drawRectBatchesViaRenderer } from '../rectsViaRenderer'

describe('drawRectBatchesViaRenderer', () => {
  it('draws each non-empty batch via drawInstances', () => {
    const r = createMockRenderer()
    const ok = drawRectBatchesViaRenderer(
      r,
      [
        { buf: new Float32Array([0, 0, 10, 20]), count: 1, color: '#0f0' },
        { buf: new Float32Array(0), count: 0, color: '#f00' },
        { buf: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]), count: 2, color: '#00f' },
      ],
      3,
    )
    expect(ok).toBe(true)
    expect(r.drawInstances).toHaveBeenCalledTimes(2)
  })

  it('returns false when any batch fails', () => {
    const r = createMockRenderer()
    r.drawInstances.mockReturnValueOnce(true).mockReturnValueOnce(false)
    expect(
      drawRectBatchesViaRenderer(
        r,
        [
          { buf: new Float32Array([0, 0, 1, 1]), count: 1, color: '#0f0' },
          { buf: new Float32Array([0, 0, 1, 1]), count: 1, color: '#f00' },
        ],
        0,
      ),
    ).toBe(false)
  })

  it('returns true when all counts are zero', () => {
    const r = createMockRenderer()
    expect(
      drawRectBatchesViaRenderer(r, [{ buf: new Float32Array(0), count: 0, color: '#0f0' }], 0),
    ).toBe(true)
    expect(r.drawInstances).not.toHaveBeenCalled()
  })

  it('caches pipeline and unit vertex buffer; creates + destroys instance buffer per batch', () => {
    const r = createMockRenderer()
    const batches = [{ buf: new Float32Array([0, 0, 10, 20]), count: 1, color: '#0f0' }]
    expect(drawRectBatchesViaRenderer(r, batches, 0)).toBe(true)
    expect(drawRectBatchesViaRenderer(r, batches, 3)).toBe(true)
    expect(r.createPipeline).toHaveBeenCalledTimes(1)
    // unit buffer created once; each batch creates its own instance buffer
    expect(r.createBuffer).toHaveBeenCalledTimes(3)
    expect(r.destroyBuffer).toHaveBeenCalledTimes(2)
  })
})
