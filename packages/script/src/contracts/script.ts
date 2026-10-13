/**
 * 脚本契约：指标定义、输入声明与逐 bar 执行上下文。
 */
import type {
  InputSchema,
  PlotDeclaration,
  PlotFillDeclaration,
} from '@363045841yyt/klinechart-plot-contracts'
import type { Series } from '../series/types.js'
import type { LibraryModules } from './library.js'

export type { InputDef, InputSchema } from '@363045841yyt/klinechart-plot-contracts'

/** Plot 的标识和样式。 */
export interface PlotOptions {
  /** 区分不同的 Plot，每根 K 线使用相同的 id。 */
  id: string
  color?: string
}

/** 逐 bar 执行上下文：行情序列 + 类型目录中的库 + Plot 系函数。 */
export interface Ctx extends LibraryModules {
  readonly open: Series
  readonly high: Series
  readonly low: Series
  readonly close: Series
  readonly volume: Series
  readonly time: Series
  /** 输出绘图点，id 指定它属于哪个 Plot。 */
  plot(value: number, options: PlotOptions): void
}

/** 指标定义：名称、输入声明与逐 bar 执行函数。 */
export interface IndicatorDef<P> {
  /** 指标名称。 */
  name: string
  /** 注册位置；缺省放在副图。 */
  readonly pane?: 'main' | 'sub'
  /** 显示名称；缺省取 name。 */
  readonly displayName?: string
  /** 输入参数声明。 */
  inputs: InputSchema<P>
  /**
   * 可选 Plot 声明。
   *
   * 声明后，采集器只接受这些 id 的输出，并按声明补齐样式与空序列；
   * 不声明时允许脚本动态产生任意 id，按默认折线处理。
   */
  readonly plots?: readonly PlotDeclaration[]
  /** 可选填充声明，引用 plots 中的 id。 */
  readonly fills?: readonly PlotFillDeclaration[]
  /** 每根 K 线执行一次。 */
  onBar(ctx: Ctx, params: P): void
}
