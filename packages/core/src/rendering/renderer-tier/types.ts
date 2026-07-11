/**
 * Renderer tier types.
 *
 * `RendererTier` is a totally-ordered enum (`'webgpu' > 'webgl2' >
 * 'canvas2d' > 'none'`). Consumers pick the highest tier the host
 * environment supports and configure the {@link Renderer} accordingly.
 *
 * Why a string union (not a numeric enum):
 *   - Logs and analytics stay human-readable.
 *   - Tree-shakable; no runtime enum object.
 *   - Cross-package safe — string equality survives serialization
 *     and avoids the "two enum copies don't compare" footgun.
 */

export type RendererTier = 'webgpu' | 'webgl2' | 'canvas2d' | 'none'

/**
 * Numeric rank used for `compareRendererTier`. Higher = better.
 * Exposed so consumers can write their own "at least X" guards.
 */
export const RENDERER_TIER_RANK: Readonly<Record<RendererTier, number>> = {
  webgpu: 3,
  webgl2: 2,
  canvas2d: 1,
  none: 0,
}

/**
 * Detection result. `tier` is the picked tier; `reason` is a one-line
 * human-readable explanation (intended for diagnostics, not for
 * branching — branch on `tier`).
 *
 * `tried` enumerates the tiers probed in order — useful when reporting
 * "we wanted WebGPU but it threw" telemetry.
 */
export interface RendererTierResult {
  readonly tier: RendererTier
  readonly reason: string
  readonly tried: ReadonlyArray<RendererTier>
}

/**
 * Probe injection — the unit tests use this to simulate every tier
 * combination without poking globals. Production code passes nothing
 * and the real `globalThis` probes run.
 *
 * Each probe returns `true` when the tier is detected, `false` when
 * it is conclusively unavailable. Throwing is treated as "unavailable"
 * with the message folded into `reason`.
 */
export interface RendererTierProbes {
  readonly webgpu?: () => boolean
  readonly webgl2?: () => boolean
  readonly canvas2d?: () => boolean
}

export interface DetectRendererTierOptions {
  readonly probes?: RendererTierProbes
}
