import { describe, it, expect, vi } from 'vitest'

import type { Renderer } from '../../../rendering/render/Renderer'
import { drawCandlesViaRenderer } from '../candleViaRenderer'

function mockRenderer(): Renderer & {
  writeBuffer: ReturnType<typeof vi.fn>
  drawInstances: ReturnType<typeof vi.fn>
  createBuffer: ReturnType<typeof vi.fn>
  createPipeline: ReturnType<typeof vi.fn>
  destroyBuffer: ReturnType<typeof vi.fn>
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
    caps: { compute: false, storageBuffer: false, maxInstances: 1_000_000, name: 'webgl2' },
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
    drawInstances: vi.fn(),
    drawLines: vi.fn(),
    dispatchCompute: () => {},
    endFrame: vi.fn(),
    dispose: vi.fn(),
  } as never
}

describe('drawCandlesViaRenderer', () => {
  const nonEmpty = {
    upBodyCount: 1,
    downBodyCount: 1,
    upWickCount: 1,
    downWickCount: 1,
    upBodyBuf: new Float32Array([0, 0, 10, 20]),
    downBodyBuf: new Float32Array([20, 0, 10, 20]),
    upWickBuf: new Float32Array([5, 0, 1, 30]),
    downWickBuf: new Float32Array([25, 0, 1, 30]),
  }

  it('issues 4 drawInstances for non-empty up/down body and wick', () => {
    const r = mockRenderer()
    r.drawInstances.mockReturnValue(true)
    const ok = drawCandlesViaRenderer(r, nonEmpty, '#0f0', '#f00', 0)
    expect(ok).toBe(true)
    expect(r.drawInstances).toHaveBeenCalledTimes(4)
    expect(r.writeBuffer).toHaveBeenCalledTimes(4)
  })

  it('returns true without draw when all counts are zero', () => {
    const r = mockRenderer()
    r.drawInstances.mockReturnValue(true)
    const prepared = {
      upBodyCount: 0,
      downBodyCount: 0,
      upWickCount: 0,
      downWickCount: 0,
      upBodyBuf: new Float32Array(0),
      downBodyBuf: new Float32Array(0),
      upWickBuf: new Float32Array(0),
      downWickBuf: new Float32Array(0),
    }
    const ok = drawCandlesViaRenderer(r, prepared, '#0f0', '#f00', 0)
    expect(ok).toBe(true)
    expect(r.drawInstances).not.toHaveBeenCalled()
  })

  it('returns false when surface unavailable', () => {
    const r = mockRenderer()
    r.surface.isAvailable = () => false
    expect(drawCandlesViaRenderer(r, nonEmpty, '#0f0', '#f00', 0)).toBe(false)
  })

  it('returns false when drawInstances silent-fails (fail-closed)', () => {
    const r = mockRenderer()
    r.drawInstances.mockReturnValue(false)
    expect(drawCandlesViaRenderer(r, nonEmpty, '#0f0', '#f00', 0)).toBe(false)
  })

  it('returns false if any non-empty batch fails', () => {
    const r = mockRenderer()
    r.drawInstances
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
    expect(drawCandlesViaRenderer(r, nonEmpty, '#0f0', '#f00', 0)).toBe(false)
  })
})
