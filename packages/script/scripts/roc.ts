// 价格变化率，基期价格为零时不输出。
defineIndicator({
  version: 2,
  name: 'ROC',
  title: '变化率',
  info: 'ROC 衡量当前价格与 N 日前价格的百分比变化，正值表示上涨动能，负值表示下跌动能。',
  position: Position.sub,
  format: Format.percent,
  onBar() {
    const period = input.int(12, { title: '周期', min: 1 })
    const value = ta.roc(close, period)
    plot.Line(value, 'roc', { label: 'ROC', color: Color.purple })
    plot.Line(0, 'zero', { label: '0', color: Color.gray, dash: [4, 4] })
  },
})
