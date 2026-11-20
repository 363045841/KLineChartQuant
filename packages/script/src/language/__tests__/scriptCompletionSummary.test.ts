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
const SOURCE = `defineIndicator({ scriptVersion: 2, name: 'Hints', position: Position.main, onBar() {
  const timeframe = input.timeframe(Timeframe.day, { options: [Timeframe.hour1] })
  const color = Color.teal
  const source = DataSource.mt5
  const style = ShapeStyle.diamond
  const location = ShapeLocation.absolute
  const size = ShapeSize.huge
  const lineRef = line.all
  const dashed = LineStyle.dashed
  const extended = extend.right
  const timestamp = xloc.barTime
  plot.Candle(open, high, low, close, 'candle')
  const [trend, direction] = ta.supertrend(3, 10)
  const atr = ta.atr(10)
  const [dif, dea, histogram] = ta.macd(close, 12, 26, 9)
} })`

describe('脚本补全中文名', () => {
  it.each([
    ['Timeframe', 'hour1', '1 小时'],
    ['Timeframe', 'month12', '年线'],
    ['Color', 'teal', '蓝绿'],
    ['DataSource', 'mt5', 'MetaTrader 5'],
    ['ShapeStyle', 'diamond', '菱形'],
    ['ShapeLocation', 'absolute', '按价格定位'],
    ['ShapeSize', 'huge', '特大'],
    ['Position', 'sub', '副图'],
    ['input', 'timeframe', '目标周期'],
    ['plot', 'Candle', '蜡烛图'],
    ['plot', 'LineBR', '断线折线'],
    ['plot', 'StepLine', '阶梯线'],
    ['plot', 'StepLineBR', '断线阶梯线'],
    ['ta', 'atr', '平均真实波幅'],
    ['ta', 'supertrend', '超级趋势'],
    ['ta', 'macd', '指数平滑异同平均线'],
    ['line', 'new', '绘制线段'],
    ['line', 'setXY2', '设置终点'],
    ['line', 'getPrice', '求价格'],
    ['LineStyle', 'dashed', '虚线'],
    ['extend', 'right', '延伸至终点之外'],
    ['xloc', 'barTime', '毫秒时间戳'],
  ])('%s.%s 的补全中文名是「%s」', (owner, member, summary) => {
    expect(completionSummary(SOURCE, owner, member)).toBe(summary)
  })
})
