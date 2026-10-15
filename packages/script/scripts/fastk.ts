// 快速随机指标，完整窗口内最高最低价相同时取中值 50。
defineIndicator({
  name: 'FASTK',
  pane: PaneKind.Sub,
  indicatorType: IndicatorType.Momentum,
  inputs: {
    period: input(9, { title: '周期' }),
  },
  onBar() {
    const upper = ta.highest(high, params.period)[0]
    const lower = ta.lowest(low, params.period)[0]
    const value = upper === lower ? 50 : (100 * (close[0] - lower)) / (upper - lower)
    plot.Line(value, { id: 'fastk', label: 'FASTK', color: '#ffb74d' })
    for (const level of [80, 50, 20]) {
      plot.Line(level, {
        id: 'guide' + level,
        label: String(level),
        color: '#808080',
        dash: [4, 4],
      })
    }
  },
})
