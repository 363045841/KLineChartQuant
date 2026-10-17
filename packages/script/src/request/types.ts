/** Request 的脚本接口与可跨 Worker 传递的行情快照。 */

import type { DataSource } from '@363045841yyt/klinechart-plot-contracts'
import type { Bar } from '../contracts/input.js'
import type { Series } from '../series/types.js'

export type RequestValue = number | string | boolean | null | readonly RequestValue[]
export type RequestResult<T> = T extends Series
  ? number
  : T extends readonly unknown[]
    ? { readonly [K in keyof T]: RequestResult<T[K]> }
    : T

export interface SecurityOptions {
  /** 目标来源的 sourceId；仅当请求品种与图表品种不同时必须显式指定。 */
  readonly source?: DataSource
  /** 图表历史起点之前额外加载的目标周期预热根数，缺省 300。 */
  readonly calcBarsCount?: number
  /** 缺口策略：`off` 延续最近可用结果，`on` 只在新目标结果出现时输出，其余点留空。 */
  readonly gaps?: 'off' | 'on'
}

/** 跨品种、跨周期取数入口，等价于 Pine 的 request.security。 */
export interface ScriptRequest {
  /**
   * 在目标品种、目标周期上独立计算，并把结果按时间对齐回当前图表。
   *
   * 回调在目标周期的独立上下文中逐根执行：其中的 `open`、`close`、历史下标和 `ta` 都属于目标周期；请求必须在 onBar 顶层调用，不支持嵌套请求或逐 bar 动态改变品种。
   *
   * @param symbol 目标品种；与图表品种相同时继承图表来源，不同时必须指定 source。
   * @param timeframe 目标周期，如 '60'、'D'；不得低于图表周期。
   * @param expression 无参同步回调，返回标量、序列或元组。
   * @param options 来源、预热根数与缺口策略。
   * @returns 对齐到当前 bar 的标量或只读元组。
   *
   * @example
   * const [o, h, l, c] = request.security(syminfo.tickerid, '60', () => [open, high, low, close] as const)
   */
  security<T extends RequestValue | Series | readonly (RequestValue | Series)[]>(
    symbol: string,
    timeframe: string,
    expression: () => T,
    options?: SecurityOptions,
  ): RequestResult<T>
}

export interface SecurityRequest extends SecurityOptions {
  readonly id: string
  readonly symbol: string
  readonly timeframe: string
}

export interface RequestSnapshot {
  readonly id: string
  readonly bars: readonly Bar[]
}

export interface ScriptRequestContext {
  readonly symbol: string
  readonly snapshots: readonly RequestSnapshot[]
}

export interface RequestExecution {
  readonly symbol: string
  readonly expressionId?: string
  readonly results: Readonly<Record<string, readonly RequestValue[]>>
}
