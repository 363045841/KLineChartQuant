import { describe, expect, it } from 'vitest'

import { createMockRenderer } from '@/rendering/render/__tests__/helpers/rendererTestKit'

import { drawCandlesViaRenderer } from '../candleViaRenderer'

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
    const r = createMockRenderer()
    r.drawInstances.mockReturnValue(true)
    const ok = drawCandlesViaRenderer(r, nonEmpty, '#0f0', '#f00', 0)
    expect(ok).toBe(true)
    expect(r.drawInstances).toHaveBeenCalledTimes(4)
    expect(r.writeBuffer).toHaveBeenCalledTimes(4)
  })

  it('returns true without draw when all counts are zero', () => {
    const r = createMockRenderer()
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
    const r = createMockRenderer()
    r.surface.isAvailable.mockReturnValue(false)
    expect(drawCandlesViaRenderer(r, nonEmpty, '#0f0', '#f00', 0)).toBe(false)
  })

  it('returns false when drawInstances silent-fails (fail-closed)', () => {
    const r = createMockRenderer()
    r.drawInstances.mockReturnValue(false)
    expect(drawCandlesViaRenderer(r, nonEmpty, '#0f0', '#f00', 0)).toBe(false)
  })

  it('returns false if any non-empty batch fails', () => {
    const r = createMockRenderer()
    r.drawInstances.mockReturnValueOnce(true).mockReturnValueOnce(false)
    expect(drawCandlesViaRenderer(r, nonEmpty, '#0f0', '#f00', 0)).toBe(false)
  })
})
