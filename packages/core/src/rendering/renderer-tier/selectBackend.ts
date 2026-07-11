/**
 * Renderer backend selector — bridges the tier-detection layer
 * ({@link detectRendererTier}) to the actual backend factory the
 * `Renderer` interface will instantiate.
 *
 * Why this exists separately from {@link detectRendererTier}:
 *
 *   - Detection answers "what's *possible*?".
 *   - Selection answers "what's *registered* and matches what's possible?".
 *
 * In practice the answers diverge. A consumer can:
 *
 *   (a) Choose to omit a backend they don't want to ship (e.g. drop the
 *       WebGPU backend to save bundle size; the selector then falls
 *       through to WebGL2 even when the host supports WebGPU).
 *   (b) Override a backend for a specific tier (e.g. inject a Canvas2D
 *       backend stub during tests, so the chart still renders headless).
 *
 * Both shapes need a *structural* fallback chain, not just "give me the
 * factory for the detected tier". This module formalises that chain so
 * the wiring is consistent across React, Vue, Angular, and any future
 * adapter.
 *
 * Pure data: no DOM, no async, no side effects. The returned factory is
 * just the function the caller registered.
 */

import { KLineChartError } from '../../errors'

import { detectRendererTier, isTierAtLeast } from './detectRendererTier'
import {
  RENDERER_TIER_RANK,
  type DetectRendererTierOptions,
  type RendererTier,
  type RendererTierResult,
} from './types'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

/**
 * Opaque factory shape. We don't constrain the Renderer construction here —
 * the consumer's backend implementation knows its own signature. The
 * selector is purely about *which* factory to hand back.
 */
export type BackendFactory<T = unknown> = () => T

/**
 * Map of tier → registered factory. Tiers that are absent or `null` are
 * treated as "not registered" and skipped during selection.
 *
 * `'none'` is intentionally absent from the type. A `'none'` tier is the
 * absence of any rendering capability; there is nothing to register.
 */
export type BackendRegistry<T = unknown> = Partial<
  Record<Exclude<RendererTier, 'none'>, BackendFactory<T> | null>
>

/**
 * Selection result. `tier` is the effective tier the chosen factory
 * targets — which is at most the detected tier. `fallbackChain`
 * enumerates the tiers the selector traversed (high → low). When no
 * backend is registered for any tier ≤ the detected tier, returns
 * `tier: 'none'` and `factory: null`.
 */
export interface BackendSelection<T = unknown> {
  readonly tier: RendererTier
  readonly factory: BackendFactory<T> | null
  readonly fallbackChain: ReadonlyArray<RendererTier>
  readonly reason: string
  /**
   * The original tier-detection result. Useful for telemetry — when
   * `tier < detection.tier` the consumer knows the host could have
   * done better but the registry was the binding constraint.
   */
  readonly detection: RendererTierResult
}

export interface SelectBackendOptions<T = unknown> {
  readonly registry: BackendRegistry<T>
  /**
   * Tier-detection probes pass-through for tests. Same shape as
   * {@link DetectRendererTierOptions}.
   */
  readonly detect?: DetectRendererTierOptions
  /**
   * Optional pre-computed detection result. When provided, the selector
   * skips `detectRendererTier()` and uses this directly. Useful when
   * the caller cached the detection at app startup.
   */
  readonly detection?: RendererTierResult
  /**
   * Optional floor — refuse to select a backend below this tier even
   * if a lower-tier factory is registered. Used by features that need
   * GPU compute (`minimum: 'webgl2'`). When the floor can't be met,
   * the result has `tier: 'none'` and `factory: null`.
   */
  readonly minimum?: RendererTier
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

const SEARCH_ORDER: ReadonlyArray<Exclude<RendererTier, 'none'>> = ['webgpu', 'webgl2', 'canvas2d']

/**
 * Pick the highest registered backend at or below the detected tier
 * (and at or above the optional minimum). Pure-data.
 *
 *   const sel = selectBackend({
 *     registry: { webgpu: makeGpu, webgl2: makeGl2, canvas2d: makeC2d },
 *   })
 *   if (sel.factory === null) throw new Error('no renderer')
 *   const renderer = sel.factory()
 *
 * Telemetry pattern:
 *
 *   if (sel.tier !== sel.detection.tier) {
 *     log('renderer downgrade', sel.detection.tier, '→', sel.tier, sel.reason)
 *   }
 */
export function selectBackend<T = unknown>(opts: SelectBackendOptions<T>): BackendSelection<T> {
  const detection = opts.detection ?? detectRendererTier(opts.detect)
  const detectedTier = detection.tier
  const minimum = opts.minimum ?? 'none'

  // Validate the minimum is a known tier; reject 'none' as a minimum
  // because a 'none' floor is meaningless — nothing can be below it.
  if (!(minimum in RENDERER_TIER_RANK)) {
    throw new KLineChartError(
      'INVALID_PARAM',
      `selectBackend: minimum must be a RendererTier, got ${JSON.stringify(minimum)}`,
    )
  }

  const chain: RendererTier[] = []
  // Search from the detected tier downwards through SEARCH_ORDER.
  for (const candidate of SEARCH_ORDER) {
    // Skip tiers above the detected ceiling.
    if (RENDERER_TIER_RANK[candidate] > RENDERER_TIER_RANK[detectedTier]) {
      continue
    }
    chain.push(candidate)
    // Skip below the configured minimum.
    if (!isTierAtLeast(candidate, minimum)) {
      // No further candidate will satisfy the minimum.
      break
    }
    const factory = opts.registry[candidate] ?? null
    if (factory !== null) {
      return {
        tier: candidate,
        factory,
        fallbackChain: chain,
        reason:
          candidate === detectedTier
            ? `direct match: detected ${candidate} and ${candidate} backend is registered`
            : `downgrade: detected ${detectedTier}, but only ${candidate} backend is registered`,
        detection,
      }
    }
  }

  return {
    tier: 'none',
    factory: null,
    fallbackChain: chain,
    reason:
      detectedTier === 'none'
        ? `host has no renderable tier`
        : `no registered backend at or below detected ${detectedTier}` +
          (opts.minimum !== undefined && opts.minimum !== 'none'
            ? ` (minimum=${opts.minimum})`
            : ''),
    detection,
  }
}

/**
 * Strict variant: throws `KLineChartError('INVALID_STATE')` if no factory
 * could be selected. Use when a renderable backend is mandatory.
 */
export function selectBackendOrThrow<T = unknown>(
  opts: SelectBackendOptions<T>,
): BackendSelection<T> & { factory: BackendFactory<T> } {
  const sel = selectBackend(opts)
  if (sel.factory === null) {
    throw new KLineChartError('INVALID_STATE', `selectBackendOrThrow: ${sel.reason}`)
  }
  return sel as BackendSelection<T> & { factory: BackendFactory<T> }
}
