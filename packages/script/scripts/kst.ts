// 四组变化率的加权和及其信号均线。
defineIndicator({
  name: 'KST',
  position: Position.Sub,
  format: Format.Percent,
  onBar() {
    const roc1 = input.int(10, { title: 'ROC 周期 1', min: 1 })
    const roc2 = input.int(15, { title: 'ROC 周期 2', min: 1 })
    const roc3 = input.int(20, { title: 'ROC 周期 3', min: 1 })
    const roc4 = input.int(30, { title: 'ROC 周期 4', min: 1 })
    const signalPeriod = input.int(9, { title: '信号周期', min: 1 })
    const first = ta.sma(ta.roc(close, roc1), 10)
    const second = ta.sma(ta.roc(close, roc2), 10)
    const third = ta.sma(ta.roc(close, roc3), 10)
    const fourth = ta.sma(ta.roc(close, roc4), 15)
    const value = derive(
      `kst:${roc1}:${roc2}:${roc3}:${roc4}`,
      (_self, offset) =>
        first[offset] + 2 * second[offset] + 3 * third[offset] + 4 * fourth[offset],
    )
    plot.Line(value, 'kst', { label: 'KST', color: Color.Purple })
    plot.Line(ta.sma(value, signalPeriod), 'signal', { label: 'Signal', color: Color.Blue })
    plot.Line(0, 'zero', { label: '0', color: Color.Gray, dash: [4, 4] })
  },
})
