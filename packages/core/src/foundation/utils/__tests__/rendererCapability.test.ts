/**
 * Tests for `detectRendererTier`.
 *
 * Coverage:
 *   1. Probe selection cascade — WebGPU wins, WebGL2 wins when no GPU,
 *      Canvas2D wins when no WebGL, `'none'` when nothing.
 *   2. `reason` string carries the failure narrative.
 *   3. Probes throwing are treated as "not available", error message
 *      folded into reason.
 *   4. `tried` enumerates the probed order.
 *   5. Production probes (no override) run without crashing — in Node
 *      they should pick `'none'` since there's no document/navigator
 *      with these capabilities.
 */

import { describe, expect, it } from 'vitest'

import { detectRendererTier } from '../rendererCapability'

// Helpers — return preset probe maps for each scenario.
const TRUE = (): boolean => true
const FALSE = (): boolean => false
const THROW = (msg: string) => (): boolean => {
  throw new Error(msg)
}

describe('detectRendererTier — cascade', () => {
  it('selects webgpu when available', () => {
    const r = detectRendererTier({
      probes: { webgpu: TRUE, webgl2: TRUE, canvas2d: TRUE },
    })
    expect(r.tier).toBe('webgpu')
    expect(r.tried).toEqual(['webgpu'])
  })

  it('falls through to webgl2 when WebGPU unavailable', () => {
    const r = detectRendererTier({
      probes: { webgpu: FALSE, webgl2: TRUE, canvas2d: TRUE },
    })
    expect(r.tier).toBe('webgl2')
    expect(r.tried).toEqual(['webgpu', 'webgl2'])
  })

  it('falls through to canvas2d when neither WebGPU nor WebGL2 available', () => {
    const r = detectRendererTier({
      probes: { webgpu: FALSE, webgl2: FALSE, canvas2d: TRUE },
    })
    expect(r.tier).toBe('canvas2d')
    expect(r.tried).toEqual(['webgpu', 'webgl2', 'canvas2d'])
  })

  it('returns none when nothing works', () => {
    const r = detectRendererTier({
      probes: { webgpu: FALSE, webgl2: FALSE, canvas2d: FALSE },
    })
    expect(r.tier).toBe('none')
    expect(r.tried).toEqual(['webgpu', 'webgl2', 'canvas2d'])
  })
})

describe('detectRendererTier — reason narrative', () => {
  it('selected tier reason mentions the tier', () => {
    const r = detectRendererTier({ probes: { webgpu: TRUE } })
    expect(r.reason).toContain('selected webgpu')
  })

  it('none reason enumerates all tried tiers', () => {
    const r = detectRendererTier({
      probes: { webgpu: FALSE, webgl2: FALSE, canvas2d: FALSE },
    })
    expect(r.reason).toContain('webgpu')
    expect(r.reason).toContain('webgl2')
    expect(r.reason).toContain('canvas2d')
  })

  it('probe throws are folded into the reason as "threw \\"...\\""', () => {
    const r = detectRendererTier({
      probes: {
        webgpu: THROW('adapter init crashed'),
        webgl2: FALSE,
        canvas2d: FALSE,
      },
    })
    expect(r.tier).toBe('none')
    expect(r.reason).toContain('threw "adapter init crashed"')
  })

  it('probe throws cascade gracefully to the next tier', () => {
    const r = detectRendererTier({
      probes: { webgpu: THROW('gpu denied'), webgl2: TRUE, canvas2d: TRUE },
    })
    expect(r.tier).toBe('webgl2')
  })
})

describe('detectRendererTier — production probes (no override)', () => {
  it('runs without crashing in a Node environment', () => {
    // In jsdom / Node, navigator may or may not exist; the contract is
    // simply that the call returns a well-formed result and does not throw.
    const r = detectRendererTier()
    expect(typeof r.tier).toBe('string')
    expect(typeof r.reason).toBe('string')
    expect(Array.isArray(r.tried)).toBe(true)
  })
})
