/**
 * 脚本契约：指标定义、输入声明与逐 bar 执行上下文。
 */

/** Plot 的标识和样式。 */
export interface PlotOptions {
  /** 区分不同的 Plot，每根 K 线使用相同的 id。 */
  id: string
  color?: string
}

/** 逐 bar 执行时由引擎注入的上下文：内置序列 + Plot 系函数。 */
export interface Ctx {
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly volume: number
  /** 输出绘图点，id 指定它属于哪个 Plot。 */
  plot(value: number, options: PlotOptions): void
}

/** 单个输入参数的声明。 */
export interface InputDef<T> {
  default: T
}

/** 输入声明表：键即参数名，P 为解析后的参数值类型。 */
export type InputSchema<P> = { [K in keyof P]: InputDef<P[K]> }

/** 指标定义：名称、输入声明与逐 bar 执行函数。 */
export interface IndicatorDef<P> {
  /** 指标名称。 */
  name: string
  /** 输入参数声明。 */
  inputs: InputSchema<P>
  /** 每根 K 线执行一次。 */
  onBar(ctx: Ctx, params: P): void
}
