/** Supertrend：TA 库负责 ATR 与趋势递推，脚本以两条断线折线表达独立趋势区间。 */
defineIndicator({
  name: 'SuperTrend',
  title: '超级趋势',
  info: 'SuperTrend 基于 ATR 的通道突破系统，价格在通道上方为多头趋势，下方为空头趋势。',
  position: Position.Main,
  onBar() {
    const atrPeriod = input.int(10, { title: 'ATR 周期', min: 1, max: 100 })
    const multiplier = input.float(3, { title: '倍数', min: 0.5, max: 10, step: 0.5 })
    const [trend, direction] = ta.supertrend(multiplier, atrPeriod)
    plot.LineBR(direction[0] < 0 ? trend[0] : null, 'up', { label: 'ST Up', color: Color.Teal })
    plot.LineBR(direction[0] > 0 ? trend[0] : null, 'down', { label: 'ST Down', color: Color.Red })
  },
})
