/** 期权快照注入 QuickJS 时保留 NaN/Infinity：JSON 会把缺值静默变成 null。 */
import type { OptionLevelsRow } from '@363045841yyt/klinechart-plot-contracts'
import type { ScriptOptionLevels } from '../types.js'

/** 单行字面量：值只有数字、字符串与 null，逐字段照契约输出，不手写第二份字段表。 */
function rowLiteral(row: OptionLevelsRow): string {
  const fields = Object.entries(row).map(([key, value]) => {
    // String(number) 对 NaN / Infinity 也是合法 JS 字面量，不需要单独分支。
    const literal = typeof value === 'number' ? String(value) : JSON.stringify(value)
    return `${JSON.stringify(key)}:${literal}`
  })
  return `{${fields.join(',')}}`
}

/**
 * 生成 VM 全局 `__optionContext` 的赋值表达式；不包含用户可执行代码。
 *
 * @param snapshot 本次运行的期权快照
 * @returns 可直接 eval 的对象字面量
 */
export function optionContextSource(snapshot: ScriptOptionLevels): string {
  const levels = snapshot.levels.map(rowLiteral).join(',')
  return `{underlying:${JSON.stringify(snapshot.underlying)},levels:[${levels}]}`
}
