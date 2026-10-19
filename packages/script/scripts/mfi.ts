// MFI：窗口内正向与负向典型价现金流的比值。
defineIndicator({
  name: 'MFI',
  position: Position.Sub,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    const typical = derive(
      'mfi-typical',
      (_self, offset) => (high[offset] + low[offset] + close[offset]) / 3,
    )
    const positive = derive('mfi-positive', (_self, offset) => {
      const current = typical[offset]
      const previous = typical[offset + 1]
      if (Number.isNaN(previous) || current <= previous) return 0
      return current * volume[offset]
    })
    const negative = derive('mfi-negative', (_self, offset) => {
      const current = typical[offset]
      const previous = typical[offset + 1]
      if (Number.isNaN(previous) || current >= previous) return 0
      return current * volume[offset]
    })
    const positiveSum = ta.sum(positive, period)[0]
    const negativeSum = ta.sum(negative, period)[0]
    plot.Line(negativeSum > 0 ? 100 - 100 / (1 + positiveSum / negativeSum) : 100, 'mfi', {
      label: 'MFI',
      color: Color.Blue,
    })
    plot.Line(80, 'overbought', { label: '80', color: Color.Gray, dash: [4, 4] })
    plot.Line(20, 'oversold', { label: '20', color: Color.Gray, dash: [4, 4] })
  },
})
