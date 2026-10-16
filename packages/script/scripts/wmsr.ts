// 威廉指标，完整窗口内最高最低价相同时取中值 -50。
defineIndicator({
  name: 'WMSR',
  pane: PaneKind.Sub,
  indicatorType: IndicatorType.Momentum,
  inputs: {
    period: input(14, { title: '周期' }),
  },
  onBar() {
    const upper = ta.highest(high, params.period)[0]
    const lower = ta.lowest(low, params.period)[0]
    const value = upper === lower ? -50 : (-100 * (upper - close[0])) / (upper - lower)
    plot.Line(value, { id: 'wmsr', label: 'WMSR', color: Color.Purple })
    for (const level of [-20, -50, -80]) {
      plot.Line(level, {
        id: 'guide' + level,
        label: String(level),
        color: Color.Gray,
        dash: [4, 4],
      })
    }
  },
})
