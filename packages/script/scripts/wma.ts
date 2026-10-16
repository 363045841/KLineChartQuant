// 线性加权移动平均，越新的价格权重越大。
defineIndicator({
  name: 'WMA',
  pane: PaneKind.Main,
  indicatorType: IndicatorType.MovingAverage,
  inputs: {
    period: input(9, { title: '周期' }),
  },
  onBar() {
    const value = ta.wma(close, params.period)[0]
    plot.Line(value, { id: 'wma', label: 'WMA', color: Color.Blue })
  },
})
