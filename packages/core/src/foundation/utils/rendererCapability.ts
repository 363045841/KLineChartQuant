/**
 * 渲染后端能力探测：按 webgpu > webgl2 > canvas2d > none 的降级顺序同步探测宿主环境。
 *
 * 只作为「初始偏好默认」供设置解析使用，不作为 runtime 生效状态源（生效后端以 RendererHost 为准）。
 *
 * 探测顺序：
 *   1. webgpu   `'gpu' in navigator`。此处不调用异步的 `navigator.gpu.requestAdapter()`，
 *               同步检查只作为挂载前的快速路径，adapter 获取由渲染器启动时重试。
 *   2. webgl2   `canvas.getContext('webgl2') !== null`。
 *   3. canvas2d `canvas.getContext('2d') !== null`。
 *   4. none     以上都不可用——通常是 SSR（无 document）或沙箱环境。
 *
 * 任何 probe 抛出的异常都会被捕获并折叠进 reason，视为不可用（不触发跳级级联）。
 */

import { KLineChartError } from '../../errors'

/** 渲染层级，全序：`'webgpu' > 'webgl2' > 'canvas2d' > 'none'`。 */
export type RendererTier = 'webgpu' | 'webgl2' | 'canvas2d' | 'none'

/** `compareRendererTier` 使用的数值 rank，越大越强。 */
export const RENDERER_TIER_RANK: Readonly<Record<RendererTier, number>> = {
  webgpu: 3,
  webgl2: 2,
  canvas2d: 1,
  none: 0,
}

/**
 * 探测结果。`tier` 为选中的层级，`reason` 为人类可读的一行说明（用于诊断，不做分支判断）。
 * `tried` 按探测顺序枚举已尝试的层级。
 */
export interface RendererTierResult {
  readonly tier: RendererTier
  readonly reason: string
  readonly tried: ReadonlyArray<RendererTier>
}

/**
 * 探测注入——单测用它模拟各种层级组合，无需改动全局对象；
 * 生产代码不传，直接跑真实的 globalThis 探测。
 * probe 返回 true 表示该层级可用，false 表示明确不可用；抛错等同不可用。
 */
export interface RendererTierProbes {
  readonly webgpu?: () => boolean
  readonly webgl2?: () => boolean
  readonly canvas2d?: () => boolean
}

export interface DetectRendererTierOptions {
  readonly probes?: RendererTierProbes
}

// ── 生产探测：仅在未注入 override 时执行 ──

/** WebGPU：检查 navigator 上是否存在 gpu 属性。 */
function probeWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

/** WebGL2：用一次性 canvas 尝试获取 webgl2 context。 */
function probeWebGl2(): boolean {
  if (typeof document === 'undefined') return false
  return document.createElement('canvas').getContext('webgl2') !== null
}

/** Canvas2D：用一次性 canvas 尝试获取 2d context。 */
function probeCanvas2d(): boolean {
  if (typeof document === 'undefined') return false
  return document.createElement('canvas').getContext('2d') !== null
}

/** 把 probe 的「返回/抛错」归一为可用性结果，抛错信息折叠进 error。 */
function runProbe(probe: () => boolean): { ok: boolean; error: string | null } {
  try {
    return { ok: probe() === true, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

const TIER_ORDER: ReadonlyArray<RendererTier> = ['webgpu', 'webgl2', 'canvas2d']

/**
 * 探测当前环境下最强的可用渲染层级。
 *
 * @param opts - 可选的 probe 注入（测试用）
 * @returns 同步返回探测结果
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
 * 严格变体：无任何可渲染层级时抛 `KLineChartError('INVALID_STATE')`。
 *
 * @param opts - 可选的 probe 注入（测试用）
 * @returns 探测结果（tier 保证不是 'none'）
 */
export function detectRendererTierOrThrow(opts?: DetectRendererTierOptions): RendererTierResult {
  const r = detectRendererTier(opts)
  if (r.tier === 'none') {
    throw new KLineChartError('INVALID_STATE', `detectRendererTierOrThrow: ${r.reason}`)
  }
  return r
}

/**
 * 层级三向比较：`a > b → 1`，`a < b → -1`，相等 → 0。
 *
 * @param a - 左操作数
 * @param b - 右操作数
 * @returns -1 | 0 | 1
 */
export function compareRendererTier(a: RendererTier, b: RendererTier): -1 | 0 | 1 {
  const ra = RENDERER_TIER_RANK[a]
  const rb = RENDERER_TIER_RANK[b]
  if (ra > rb) return 1
  if (ra < rb) return -1
  return 0
}

/**
 * `tier >= minimum` 守卫，供需要能力下限的渲染特性使用。
 *
 * @param tier - 当前层级
 * @param minimum - 要求的下限
 * @returns 是否满足下限
 */
export function isTierAtLeast(tier: RendererTier, minimum: RendererTier): boolean {
  return compareRendererTier(tier, minimum) >= 0
}
