/**
 * Tests for `selectBackend` / `selectBackendOrThrow`.
 *
 * Coverage:
 *   1. Direct match — detected tier has a registered factory.
 *   2. Downgrade — detected tier is webgpu but only webgl2 registered.
 *   3. Floor — `minimum: 'webgl2'` rejects canvas2d even if registered.
 *   4. Detection injection — `opts.detection` skips the sniffer.
 *   5. Probe injection — `opts.detect.probes` flows through.
 *   6. Empty registry → `tier: 'none'` with informative reason.
 *   7. fallbackChain enumerates tried tiers high → low.
 *   8. `factory` is the same function reference passed in.
 *   9. `reason` strings differ between direct match and downgrade.
 *  10. Invalid minimum → `KLineChartError('INVALID_PARAM')`.
 *  11. `selectBackendOrThrow` throws `INVALID_STATE` on no match.
 *  12. `detection.tier` is preserved even when downgrade occurs.
 */

import { describe, it, expect } from 'vitest'

import { selectBackend, selectBackendOrThrow, type BackendRegistry } from '..'
import { isKLineChartError } from '../../errors'
import type { RendererTierResult } from '../types'

const ALWAYS = (): boolean => true
const NEVER = (): boolean => false

function fakeFactory<T>(tag: T): () => T {
  return () => tag
}

// Helper: build a detection result without running the sniffer.
function fakeDetection(tier: RendererTierResult['tier']): RendererTierResult {
  return {
    tier,
    reason: `synthetic detection: ${tier}`,
    tried: [tier],
  }
}

// ---------------------------------------------------------------------------
// Direct match
// ---------------------------------------------------------------------------

describe('selectBackend — direct match', () => {
  it('detected webgpu + webgpu factory registered → webgpu factory', () => {
    const sel = selectBackend({
      detection: fakeDetection('webgpu'),
      registry: {
        webgpu: fakeFactory('GPU'),
        webgl2: fakeFactory('GL2'),
        canvas2d: fakeFactory('C2D'),
      },
    })
    expect(sel.tier).toBe('webgpu')
    expect(sel.factory!()).toBe('GPU')
    expect(sel.fallbackChain).toEqual(['webgpu'])
    expect(sel.reason).toContain('direct match')
  })

  it('detected canvas2d + canvas2d factory registered → canvas2d factory', () => {
    const sel = selectBackend({
      detection: fakeDetection('canvas2d'),
      registry: { canvas2d: fakeFactory('C2D') },
    })
    expect(sel.tier).toBe('canvas2d')
    expect(sel.factory!()).toBe('C2D')
    expect(sel.fallbackChain).toEqual(['canvas2d'])
  })
})

// ---------------------------------------------------------------------------
// Downgrade
// ---------------------------------------------------------------------------

describe('selectBackend — downgrade', () => {
  it('detected webgpu, only webgl2 registered → webgl2 factory', () => {
    const sel = selectBackend({
      detection: fakeDetection('webgpu'),
      registry: { webgl2: fakeFactory('GL2') },
    })
    expect(sel.tier).toBe('webgl2')
    expect(sel.factory!()).toBe('GL2')
    expect(sel.fallbackChain).toEqual(['webgpu', 'webgl2'])
    expect(sel.reason).toContain('downgrade')
    expect(sel.reason).toContain('webgpu')
  })

  it('detected webgl2, only canvas2d registered → canvas2d factory', () => {
    const sel = selectBackend({
      detection: fakeDetection('webgl2'),
      registry: { canvas2d: fakeFactory('C2D') },
    })
    expect(sel.tier).toBe('canvas2d')
    expect(sel.fallbackChain).toEqual(['webgl2', 'canvas2d'])
  })

  it('null factory entries are skipped (treated as not registered)', () => {
    const sel = selectBackend({
      detection: fakeDetection('webgpu'),
      registry: { webgpu: null, webgl2: fakeFactory('GL2') },
    })
    expect(sel.tier).toBe('webgl2')
  })

  it('detection.tier is preserved in the result even after downgrade', () => {
    const sel = selectBackend({
      detection: fakeDetection('webgpu'),
      registry: { canvas2d: fakeFactory('C2D') },
    })
    expect(sel.tier).toBe('canvas2d')
    expect(sel.detection.tier).toBe('webgpu')
  })
})

// ---------------------------------------------------------------------------
// Floor
// ---------------------------------------------------------------------------

describe('selectBackend — minimum floor', () => {
  it('minimum=webgl2 rejects canvas2d even if registered', () => {
    const sel = selectBackend({
      detection: fakeDetection('canvas2d'),
      registry: { canvas2d: fakeFactory('C2D') },
      minimum: 'webgl2',
    })
    expect(sel.tier).toBe('none')
    expect(sel.factory).toBeNull()
    expect(sel.reason).toContain('minimum=webgl2')
  })

  it('minimum=webgl2 accepts a higher tier', () => {
    const sel = selectBackend({
      detection: fakeDetection('webgl2'),
      registry: { webgl2: fakeFactory('GL2') },
      minimum: 'webgl2',
    })
    expect(sel.tier).toBe('webgl2')
  })

  it('minimum=canvas2d does not affect behaviour (effective default)', () => {
    const sel = selectBackend({
      detection: fakeDetection('canvas2d'),
      registry: { canvas2d: fakeFactory('C2D') },
      minimum: 'canvas2d',
    })
    expect(sel.tier).toBe('canvas2d')
  })
})

// ---------------------------------------------------------------------------
// Empty / no-match registries
// ---------------------------------------------------------------------------

describe('selectBackend — no match', () => {
  it('empty registry → tier:none + null factory', () => {
    const sel = selectBackend({
      detection: fakeDetection('webgpu'),
      registry: {} as BackendRegistry,
    })
    expect(sel.tier).toBe('none')
    expect(sel.factory).toBeNull()
    expect(sel.reason).toContain('no registered backend')
  })

  it('detected none + no factories → tier:none with host reason', () => {
    const sel = selectBackend({
      detection: fakeDetection('none'),
      registry: {} as BackendRegistry,
    })
    expect(sel.tier).toBe('none')
    expect(sel.reason).toContain('no renderable tier')
  })
})

// ---------------------------------------------------------------------------
// Detection / probe pass-through
// ---------------------------------------------------------------------------

describe('selectBackend — probe pass-through', () => {
  it('detect.probes flows to detectRendererTier', () => {
    const sel = selectBackend({
      registry: { canvas2d: fakeFactory('C2D') },
      detect: {
        probes: { webgpu: NEVER, webgl2: NEVER, canvas2d: ALWAYS },
      },
    })
    expect(sel.detection.tier).toBe('canvas2d')
    expect(sel.tier).toBe('canvas2d')
  })

  it('explicit detection overrides probe detection', () => {
    const sel = selectBackend({
      registry: { canvas2d: fakeFactory('C2D') },
      detection: fakeDetection('webgpu'),
      // detect.probes here would say 'canvas2d' if consulted —
      // but they shouldn't be, since explicit detection wins.
      detect: { probes: { webgpu: NEVER, webgl2: NEVER, canvas2d: ALWAYS } },
    })
    expect(sel.detection.tier).toBe('webgpu')
  })
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('selectBackend — input validation', () => {
  it('throws KLineChartError(INVALID_PARAM) on unknown minimum', () => {
    try {
      selectBackend({
        detection: fakeDetection('webgpu'),
        registry: { webgpu: fakeFactory('X') },
        minimum: 'doesNotExist' as never,
      })
      expect.fail('expected throw')
    } catch (e) {
      expect(isKLineChartError(e, 'INVALID_PARAM')).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Strict variant
// ---------------------------------------------------------------------------

describe('selectBackendOrThrow', () => {
  it('returns the selection unchanged when a factory was found', () => {
    const sel = selectBackendOrThrow({
      detection: fakeDetection('webgpu'),
      registry: { webgpu: fakeFactory('GPU') },
    })
    expect(sel.tier).toBe('webgpu')
    // Type-narrowed: factory is non-null at compile time.
    expect(sel.factory()).toBe('GPU')
  })

  it('throws KLineChartError(INVALID_STATE) on no match', () => {
    try {
      selectBackendOrThrow({
        detection: fakeDetection('none'),
        registry: {} as BackendRegistry,
      })
      expect.fail('expected throw')
    } catch (e) {
      expect(isKLineChartError(e, 'INVALID_STATE')).toBe(true)
    }
  })
})
