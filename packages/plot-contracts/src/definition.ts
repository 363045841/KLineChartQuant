/**
 * 指标定义契约：生产方（脚本，及过渡期的 core 指标）声明「一个指标长什么样」，消费方据此运行。
 */
import type { Bar } from './bar.js'
import type { PlotDeclaration, PlotFillDeclaration } from './declaration.js'
import type { PlotCollection } from './plots.js'

/** 可序列化的脚本声明；不包含执行函数。 */
export interface IndicatorSourceDefinition {
  readonly name: string
  readonly displayName?: string
  readonly pane?: 'main' | 'sub'
  readonly inputs: InputSchema<Record<string, number | string | boolean>>
  readonly plots?: readonly PlotDeclaration[]
  readonly fills?: readonly PlotFillDeclaration[]
}

/** 指标来源分类：系统内置或扩展生产者（脚本）。 */
export type IndicatorSource = 'native' | 'script'

/** 可编辑定义的版本化源码；随定义快照提交，消费者不能独立写入。 */
export interface IndicatorSourceDocument {
  readonly revision: number
  readonly source: string
  readonly definition: IndicatorSourceDefinition
}

/** 单个输入参数的声明，由 input() 工厂产出。 */
export interface InputDef<T> {
  /** 默认值，同时决定参数在面板中的编辑类型。 */
  readonly default: T
  /** 参数面板中的显示名；缺省显示参数名。 */
  readonly title?: string
}

/** 输入声明表：键即参数名，P 为解析后的参数值类型。 */
export type InputSchema<P> = { [K in keyof P]: InputDef<P[K]> }

/** 指标定义：元数据、输入声明与计算端口。 */
export interface IndicatorDefinition<P> {
  /** 指标名称。 */
  readonly name: string
  /** 显示名称；缺省取 name。 */
  readonly displayName?: string
  /** 注册位置；缺省放在副图。 */
  readonly pane?: 'main' | 'sub'
  /** 来源分类；缺省由消费方决定。 */
  readonly source?: IndicatorSource
  readonly document?: IndicatorSourceDocument
  /** 输入参数声明。 */
  readonly inputs: InputSchema<P>
  /** 计算端口：给定 bars 与参数，产出完整 PlotCollection。 */
  compute(bars: readonly Bar[], params: P): PlotCollection
}

/** 按输入声明取默认值，构成初始参数。 */
export function resolveInputDefaults<P>(inputs: InputSchema<P>): P {
  const params: Record<string, unknown> = {}
  for (const [key, def] of Object.entries(inputs as Record<string, InputDef<unknown>>)) {
    params[key] = def.default
  }
  return params as P
}
