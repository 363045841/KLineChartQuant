/** Request 的脚本接口与可跨 Worker 传递的行情快照。 */

import type { DataSource, Timeframe } from '@363045841yyt/klinechart-plot-contracts'
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
   * 在指定品种、周期的上下文中计算 expression，再将计算结果对齐到当前图表品种的 K 线时间槽位上。
   *
   * | 参数 | 类型 | 含义 |
   * | --- | --- | --- |
   * | `symbol` | `string` | 目标品种 |
   * | `timeframe` | `Timeframe` | 目标周期 |
   * | `expression` | `() => T` | 在目标品种、周期的上下文中执行的计算回调，可访问目标的 OHLC 数据；结果由 security 对齐到当前图表的时间槽位 |
   * | `options` | `SecurityOptions` | 来源、预热根数、缺口策略 |
   *
   * | 返回值 |
   * | --- |
   * | `expression` 的计算结果，对齐到当前图表品种的 K 线时间槽位；缺口按 `options.gaps` 策略处理 |
   *
   * **用法：**
   *
   * ```ts
   * const [o, h, l, c] = request.security(syminfo.tickerid, Timeframe.Hour1, () => [open, high, low, close] as const)
   * ```
   */
  security<T extends RequestValue | Series | readonly (RequestValue | Series)[]>(
    symbol: string,
    timeframe: Timeframe,
    expression: () => T,
    options?: SecurityOptions,
  ): RequestResult<T>
}

export interface SecurityRequest extends SecurityOptions {
  readonly id: string
  readonly symbol: string
  /**
   * 目标周期写法。
   *
   * 这里是跨 Worker 的计划值而非作者输入面：宿主仍接受 Provider 周期名与短写法的历史写法，
   * 校验统一由 core 的 requestPeriod 负责，因此不做 Timeframe 收窄。
   */
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
