/**
 * Synchronous renderer tier detection.
 *
 * Probes (in descending capability order):
 *
 *   1. **webgpu**   `'gpu' in navigator`. We deliberately do NOT call
 *                   `navigator.gpu.requestAdapter()` here — that's async
 *                   and the answer can change between probe and use
 *                   (e.g. user toggles the WebGPU flag). The renderer
 *                   should retry adapter acquisition at startup; this
 *                   sync check is a pre-mount fast path.
 *
 *   2. **webgl2**   `canvas.getContext('webgl2') !== null`. Probes a
 *                   throwaway `<canvas>`; if the browser hard-disabled
 *                   WebGL (some hardened policies do), this returns
 *                   null and we fall through.
 *
 *   3. **canvas2d** `canvas.getContext('2d') !== null`. Universal
 *                   fallback for browsers from the 2010s onwards.
 *
 *   4. **none**     None of the above worked — likely SSR (no document)
 *                   or a sandboxed environment. The caller can decide
 *                   whether that's an error or a "render nothing" state.
 *
 * All exceptions from a probe are caught and folded into the `reason`
 * field — a probe that throws is treated identically to one that
 * returns false (no tier-skip cascade).
 */

import { KLineChartError } from '../../errors'

import {
  RENDERER_TIER_RANK,
  type DetectRendererTierOptions,
  type RendererTier,
  type RendererTierResult,
} from './types'

// ---------------------------------------------------------------------------
// Production probes — only run when no override is supplied
// ---------------------------------------------------------------------------

function probeWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

function probeWebGl2(): boolean {
  if (typeof document === 'undefined') return false
  return document.createElement('canvas').getContext('webgl2') !== null
}

function probeCanvas2d(): boolean {
  if (typeof document === 'undefined') return false
  return document.createElement('canvas').getContext('2d') !== null
}

// ---------------------------------------------------------------------------
// runProbe — adapter that turns probe → "ok, false, or error string"
// ---------------------------------------------------------------------------

function runProbe(probe: () => boolean): { ok: boolean; error: string | null } {
  try {
    return { ok: probe() === true, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const TIER_ORDER: ReadonlyArray<RendererTier> = ['webgpu', 'webgl2', 'canvas2d']

/**
 * Detect the best renderer tier available in the current environment.
 *
 * Returns synchronously. Use this at the call site of `createChart` to
 * pick the renderer backend; persist the result if you re-mount, since
 * recomputing is cheap but not free (probing creates a throwaway canvas).
 */
export function detectRendererTier(opts?: DetectRendererTierOptions): RendererTierResult {
  const probes = opts?.probes ?? {}
  const reasonParts: string[] = []
  const tried: RendererTier[] = []

  for (const tier of TIER_ORDER) {
    tried.push(tier)
    const probe =
      tier === 'webgpu'
        ? (probes.webgpu ?? probeWebGpu)
        : tier === 'webgl2'
          ? (probes.webgl2 ?? probeWebGl2)
          : (probes.canvas2d ?? probeCanvas2d)
    const r = runProbe(probe)
    if (r.ok) {
      return {
        tier,
        reason: `selected ${tier} (${reasonParts.length === 0 ? 'first probe succeeded' : reasonParts.join('; ')})`,
        tried: [...tried],
      }
    }
    reasonParts.push(r.error === null ? `${tier}: not available` : `${tier}: threw "${r.error}"`)
  }

  return {
    tier: 'none',
    reason: `no tier available — ${reasonParts.join('; ')}`,
    tried: [...tried],
  }
}

/**
 * Strict variant: throws `KLineChartError('INVALID_STATE')` when no
 * renderable tier is found. Use when you want a hard failure rather
 * than a silent `'none'`.
 */
export function detectRendererTierOrThrow(opts?: DetectRendererTierOptions): RendererTierResult {
  const r = detectRendererTier(opts)
  if (r.tier === 'none') {
    throw new KLineChartError('INVALID_STATE', `detectRendererTierOrThrow: ${r.reason}`)
  }
  return r
}

/**
 * Three-way compare on the tier rank. `a > b → 1`, `a < b → -1`, equal → 0.
 *
 *   compareRendererTier('webgpu', 'webgl2') === 1
 *   compareRendererTier('canvas2d', 'webgl2') === -1
 *   compareRendererTier('webgl2', 'webgl2') === 0
 */
export function compareRendererTier(a: RendererTier, b: RendererTier): -1 | 0 | 1 {
  const ra = RENDERER_TIER_RANK[a]
  const rb = RENDERER_TIER_RANK[b]
  if (ra > rb) return 1
  if (ra < rb) return -1
  return 0
}

/**
 * `tier >= minimum` guard for renderer features that require a floor
 * (e.g. GPU compute volume profile needs `>= 'webgl2'`).
 */
export function isTierAtLeast(tier: RendererTier, minimum: RendererTier): boolean {
  return compareRendererTier(tier, minimum) >= 0
}
