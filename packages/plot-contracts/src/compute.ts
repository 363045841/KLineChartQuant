/** 计算依赖与重算区间：数据层只描述输入变化，计算层据此决定重算范围。 */

/**
 * 计算对历史的依赖。
 *
 * - stateless：每根 bar 只依赖最近 lookback 根；lookback 为 unbounded 时依赖整段。
 * - stateful：结果依赖窗口起点的累积状态，无法只靠区间平移。
 */
export type ComputeDependency =
  | { readonly kind: 'stateless'; readonly lookback: number | 'unbounded' }
  | { readonly kind: 'stateful' }

/** 左闭右开的重算区间，相对当前序列。 */
export interface ComputeRange {
  readonly start: number
  readonly end: number
}

/** 数据层的变化区间；只依赖 start/end，不把 core 的变更类型带进来。 */
export interface ComputeChange {
  readonly start: number
  readonly end: number
}

/** 构造可证明的无状态依赖。 */
export function stateless(lookback: number | 'unbounded'): ComputeDependency {
  return Object.freeze({ kind: 'stateless', lookback })
}

/** 顺序折叠：状态依赖窗口起点，无法只靠区间平移。 */
export const STATEFUL: ComputeDependency = Object.freeze({ kind: 'stateful' })

/**
 * 按依赖推导本次需要重算的区间。
 *
 * 有状态或无界回看一律整段；有界回看把变化区间前后各扩 lookback 根。
 */
export function resolveComputeRange(
  change: ComputeChange,
  dependency: ComputeDependency,
  length: number,
): ComputeRange {
  if (dependency.kind === 'stateful' || dependency.lookback === 'unbounded')
    return { start: 0, end: length }
  return {
    start: Math.max(0, change.start - dependency.lookback),
    end: Math.min(length, change.end + dependency.lookback),
  }
}
