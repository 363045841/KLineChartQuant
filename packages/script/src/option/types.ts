/**
 * 期权数据在脚本侧的契约。
 *
 * 宿主一次运行只带一个标的的快照：品种映射在宿主配置层（core）完成，脚本只读结果，
 * 因此脚本里不出现「哪个交易代码对应哪个期权标的」的知识。
 */
import type { OptionLevelsRow } from '@363045841yyt/klinechart-plot-contracts'

/** 一次运行可用的期权快照；宿主按品种映射取回后随执行载荷传入。 */
export interface ScriptOptionLevels {
  /** 这批快照的期权标的，例如 `BTC`。 */
  readonly underlying: string
  /** 快照，按采集时刻升序。 */
  readonly levels: readonly OptionLevelsRow[]
}

/** 期权查询范围；缺省用当前图表品种映射到的标的。 */
export interface ScriptOptionQuery {
  /**
   * 显式标的。
   *
   * 一次运行只带一个标的的数据，与当前映射不一致时查询返回 null 或空数组；
   * 不做跨标的取数，避免脚本以为在看 A 标的却画了 B 标的的线。
   */
  readonly underlying?: string
}

/** 期权关键位的脚本入口；没有映射或取不到数据时返回 null / 空数组，不抛错。 */
export interface ScriptOptionApi {
  /** 最近一条快照；无数据时返回 null。 */
  levels(query?: ScriptOptionQuery): OptionLevelsRow | null
  /** 最近若干条快照，按采集时刻升序；limit 缺省返回本次可用的全部。 */
  history(limit?: number, query?: ScriptOptionQuery): readonly OptionLevelsRow[]
}
