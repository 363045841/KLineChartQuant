// 价格变化率，基期价格为零时不输出。
defineIndicator({
  name: 'ROC',
  pane: PaneKind.Sub,
  indicatorType: IndicatorType.Momentum,
  inputs: {
    period: input(12, { title: '周期' }),
  },
  onBar() {
    const value = ta.roc(close, params.period)[0]
    plot.Line(value, { id: 'roc', label: 'ROC', color: '#ab47bc' })
    plot.Line(0, { id: 'zero', label: '0', color: '#808080', dash: [4, 4] })
  },
})
