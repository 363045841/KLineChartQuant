// 动量指标：当前收盘价与指定周期前收盘价之差。
defineIndicator({
  name: 'MOM',
  pane: PaneKind.Sub,
  indicatorType: IndicatorType.Momentum,
  inputs: {
    period: input(10, { title: '周期' }),
  },
  onBar() {
    const value = ta.mom(close, params.period)[0]
    plot.Line(value, { id: 'mom', label: 'MOM', color: '#ffb74d' })
    plot.Line(0, { id: 'zero', label: '0', color: '#808080', dash: [4, 4] })
  },
})
