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
    const middle = ta.sma(close, params.period)[0]
    const deviation = ta.stddev(close, params.period)[0] * params.multiplier
    plot(PlotKind.Line, middle + deviation, { id: 'upper', label: 'UP', color: '#ef5350' })
    plot(PlotKind.Line, middle, { id: 'middle', label: 'MID', color: '#ffb74d' })
    plot(PlotKind.Line, middle - deviation, { id: 'lower', label: 'DN', color: '#42a5f5' })
  },
})
