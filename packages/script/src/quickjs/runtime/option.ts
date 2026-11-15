/** 期权关键位的脚本入口：数据由宿主随执行载荷传入，这里只做查询与参数校验。 */

/** 期权查询范围，与编辑器声明共用同一份契约。 */
type OptionQuery = import('../../option/types.js').ScriptOptionQuery
/** 期权取数入口，与编辑器声明共用同一份契约。 */
type OptionApi = import('../../option/types.js').ScriptOptionApi

/** 取本次运行的快照行；没有映射、没有数据或标的对不上时返回 null。 */
function optionLevelsOf(query: OptionQuery | undefined) {
  if (__optionContext === undefined) return null
  if (query?.underlying !== undefined && query.underlying !== __optionContext.underlying) return null
  return __optionContext.levels
}

/** 期权取数入口；缺数据一律返回 null 或空数组，非法参数在入口拒绝。 */
const option: OptionApi = Object.freeze({
  /** 最近一条快照；没有映射或本次没有数据时为 null。 */
  levels(query?: OptionQuery) {
    return optionLevelsOf(query)?.at(-1) ?? null
  },
  /** 最近若干条快照，按采集时刻升序；limit 缺省返回本次可用的全部。 */
  history(limit?: number, query?: OptionQuery) {
    const levels = optionLevelsOf(query)
    if (limit === undefined) return levels === null ? [] : levels.slice()
    if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1)
      throw new TypeError('option.history 的 limit 必须是正整数')
    if (levels === null) return []
    return levels.slice(Math.max(0, levels.length - limit))
  },
})

Object.assign(globalThis, { option })
