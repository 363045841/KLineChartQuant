/**
 * 指标定义契约：生产方（脚本，及过渡期的 core 指标）声明「一个指标长什么样」，消费方据此运行。
 */
import type { Bar } from './bar.js'
import type { IndicatorMarketContext } from './market.js'
import type { PlotCollection } from './plots.js'

/** 可序列化的脚本声明；不包含执行函数。 */
export interface IndicatorSourceDefinition {
  readonly name: string
  /** 注册位置：主图叠加或独立副图；缺省为副图。 */
  readonly position?: 'main' | 'sub'
  readonly inputs: InputSchema<Record<string, number | string | boolean>>
}

/** 指标来源分类：系统内置或扩展生产者（脚本）。 */
export type IndicatorSource = 'native' | 'script'

/** 可编辑定义的版本化源码；随定义快照提交，消费者不能独立写入。 */
export interface IndicatorSourceDocument {
  /** 宿主授予的源码信任标记；未指定时不授予信任。 */
  readonly trusted?: boolean
  /** 脚本身份；内置源码只读，用户源码可持久化。 */
  readonly identity: 'builtin' | 'user'
  readonly revision: number
  readonly source: string
  readonly definition: IndicatorSourceDefinition
}

/** 输入参数的公共展示选项。 */
export interface InputOptions {
  /** 参数面板中的显示名；不填则显示参数名。 */
  readonly title?: string
}

/** 字符串输入可通过 options 渲染下拉选择。 */
export interface StringInputOptions extends InputOptions {
  readonly options?: readonly string[]
}

/** 数值输入的范围与步长。 */
export interface NumberInputOptions extends InputOptions {
  readonly min?: number
  readonly max?: number
  readonly step?: number
}

/** 单个输入参数的声明，由 input() 工厂产出。 */
export interface InputDef<T> extends InputOptions {
  /** 默认值，同时决定参数在面板中的编辑类型。 */
  readonly default: T
  readonly options?: readonly string[]
  readonly min?: number
  readonly max?: number
  readonly step?: number
}

/** 输入声明表：键即参数名，P 为解析后的参数值类型。 */
export type InputSchema<P> = { [K in keyof P]: InputDef<P[K]> }

/** 指标定义：元数据、输入声明与计算端口。 */
export interface IndicatorDefinition<P> {
  /**
   * 宿主分配的稳定 ID；缺省回落到 name。
   *
   * 脚本源码只声明 name（展示名），宿主为脚本分配稳定 ID，使展示名可编辑而对外身份不变；
   * core 以该 ID 作为内部 name、pane ID 与 renderer 身份，displayName 与坐标轴标签仍取 name。
   */
  readonly id?: string
  /** 指标名称；`id` 缺省时同时作为内部身份与展示名。 */
  readonly name: string
  /** 注册位置：主图叠加或独立副图；缺省放在副图。 */
  readonly position?: 'main' | 'sub'
  /** 来源分类；缺省由消费方决定。 */
  readonly source?: IndicatorSource
  readonly document?: IndicatorSourceDocument
  /** 输入参数声明。 */
  readonly inputs: InputSchema<P>
  /** 计算端口：给定 bars 与参数，产出完整 PlotCollection。 */
  compute(
    bars: readonly Bar[],
    params: P,
    market?: IndicatorMarketContext,
  ): PlotCollection | Promise<PlotCollection>
}

/** 按输入声明取默认值，构成初始参数。 */
export function resolveInputDefaults<P>(inputs: InputSchema<P>): P {
  const params: Record<string, unknown> = {}
  for (const [key, def] of Object.entries(inputs as Record<string, InputDef<unknown>>)) {
    params[key] = def.default
  }
  return params as P
}
