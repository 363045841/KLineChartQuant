/**
 * 编辑器补全的中文名来自声明上的 `@summary` 标签。
 *
 * 宿主只对成员与函数补全读取标签（`getCompletionEntryDetails`），因此脚本可见枚举的每个成员
 * 都必须带 `@summary`；这里按宿主的取详情方式逐项守住。
 */
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { createScriptLanguageSession } from '../impl/createScriptLanguageSession.js'
import { SCRIPT_SOURCE_FILE } from '../impl/scriptFiles.js'

/** 与编辑器宿主同路径取成员补全的 `@summary` 文本，未标注返回 undefined。 */
function completionSummary(source: string, owner: string, member: string): string | undefined {
  const session = createScriptLanguageSession()
  const conversion = session.updateSource(source)
  const position = conversion.toGenerated(source.indexOf(`${owner}.`) + owner.length + 1)
  const completions = session.environment.languageService.getCompletionsAtPosition(
    SCRIPT_SOURCE_FILE,
    position,
    {},
  )
  const entry = completions?.entries.find((item) => item.name === member)
  if (!entry) throw new Error(`缺少补全项：${owner}.${member}`)
  const details = session.environment.languageService.getCompletionEntryDetails(
    SCRIPT_SOURCE_FILE,
    position,
    entry.name,
    undefined,
    entry.source,
    undefined,
    entry.data,
  )
  const summary = details?.tags?.find((tag) => tag.name === 'summary')
  return ts.displayPartsToString(summary?.text).trim() || undefined
}

/** 脚本做完补全后仍可运行的最小源码，逐项包含待验证的枚举成员。 */
const SOURCE = `defineIndicator({ name: 'Hints', position: Position.Main, onBar() {
  const timeframe = input.timeframe(Timeframe.Day, { options: [Timeframe.Hour1] })
  const color = Color.Teal
  const source = DataSource.MT5
  const style = ShapeStyle.Diamond
  const location = ShapeLocation.Absolute
  const size = ShapeSize.Huge
  const kind = PlotKind.Histogram
  plot.Candle(open, high, low, close, 'candle')
  const [trend, direction] = ta.supertrend(3, 10)
  const atr = ta.atr(10)
  const [dif, dea, histogram] = ta.macd(close, 12, 26, 9)
} })`

describe('脚本补全中文名', () => {
  it.each([
    ['Timeframe', 'Hour1', '1 小时'],
    ['Timeframe', 'Month12', '年线'],
    ['Color', 'Teal', '蓝绿'],
    ['DataSource', 'MT5', 'MetaTrader 5'],
    ['PlotKind', 'Histogram', '柱状图'],
    ['ShapeStyle', 'Diamond', '菱形'],
    ['ShapeLocation', 'Absolute', '按价格定位'],
    ['ShapeSize', 'Huge', '特大'],
    ['Position', 'Sub', '副图'],
    ['input', 'timeframe', '目标周期'],
    ['plot', 'Candle', '蜡烛图'],
    ['plot', 'LineBR', '断线折线'],
    ['plot', 'StepLine', '阶梯线'],
    ['plot', 'StepLineBR', '断线阶梯线'],
    ['ta', 'atr', '平均真实波幅'],
    ['ta', 'supertrend', '超级趋势'],
    ['ta', 'macd', '指数平滑异同平均线'],
    ['PlotKind', 'StepLine', '阶梯线'],
    ['PlotKind', 'StepLineBR', '断线阶梯线'],
  ])('%s.%s 的补全中文名是「%s」', (owner, member, summary) => {
    expect(completionSummary(SOURCE, owner, member)).toBe(summary)
  })
})
