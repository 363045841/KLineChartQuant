import { describe, expect, it } from 'vitest'

import { createCanvas2DRenderer } from '../createCanvas2DRenderer'

describe('createCanvas2DRenderer', () => {
  it('fails closed so business renderers use Canvas2D', () => {
    const renderer = createCanvas2DRenderer()
    const buffer = renderer.createBuffer('instance', 16)
    const pipeline = renderer.createPipeline({ type: 'candle' })

    expect(renderer.caps.name).toBe('canvas2d')
    expect(renderer.surface.isAvailable()).toBe(false)
    expect(
      renderer.drawInstances({
        pipeline,
        vertices: buffer,
        instances: buffer,
        instanceCount: 1,
        vertexCount: 6,
      }),
    ).toBe(false)
    expect(renderer.drawLines({ pipeline, strips: [] })).toBe(false)
  })

  it('has an idempotent disposed lifecycle', () => {
    const renderer = createCanvas2DRenderer()

    renderer.dispose()
    renderer.dispose()

    expect(() => renderer.createBuffer('vertex', 8)).toThrow('Renderer is disposed')
    expect(() => renderer.createComputePipeline({})).toThrow('compute not supported')
  })
})
