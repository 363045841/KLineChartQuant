// CMF：窗口内资金流量与成交量的比值。
defineIndicator({
  name: 'CMF',
  position: Position.Sub,
  onBar() {
    const period = input.int(20, { title: '周期', min: 1 })
    const moneyFlowVolume = derive('cmf-flow', (_self, offset) => {
      const range = high[offset] - low[offset]
      const multiplier =
        range > 0 ? (close[offset] - low[offset] - (high[offset] - close[offset])) / range : 0
      return multiplier * volume[offset]
    })
    const flowSum = ta.sum(moneyFlowVolume, period)[0]
    const volumeSum = ta.sum(volume, period)[0]
    plot.Line(volumeSum > 0 ? flowSum / volumeSum : 0, 'cmf', { label: 'CMF', color: Color.Teal })
    plot.Line(0, 'guide', { label: '0', color: Color.Gray, dash: [4, 4] })
  },
})
