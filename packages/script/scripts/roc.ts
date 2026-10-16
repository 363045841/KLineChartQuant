// 价格变化率，基期价格为零时不输出。
defineIndicator({
  name: 'ROC',
  pane: PaneKind.Sub,
  indicatorType: IndicatorType.Momentum,
  inputs: {
    period: input(12, { title: '周期' }),
  },
  onBar() {
    const value = ta.roc(close, params.period)
    plot.Line(value, { id: 'roc', label: 'ROC', color: Color.Purple })
    plot.Line(0, { id: 'zero', label: '0', color: Color.Gray, dash: [4, 4] })
  },
})
