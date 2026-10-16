// 布林通道：收盘价均线加减总体标准差倍数。
defineIndicator({
  name: 'BOLL',
  pane: PaneKind.Main,
  indicatorType: IndicatorType.Channel,
  inputs: {
    period: input(20, { title: '周期' }),
    multiplier: input(2, { title: '标准差倍数' }),
  },
  onBar() {
    const middle = ta.sma(close, params.period)
    const deviation = ta.stddev(close, params.period) * params.multiplier
    plot.Line(middle + deviation, { id: 'upper', label: 'UP', color: Color.Red })
    plot.Line(middle, { id: 'middle', label: 'MID', color: Color.Orange })
    plot.Line(middle - deviation, { id: 'lower', label: 'DN', color: Color.Blue })
  },
})
