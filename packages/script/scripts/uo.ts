// UO：按三个周期加权的买压与真实波幅比值。
defineIndicator({
  name: 'UO',
  position: Position.Sub,
  onBar() {
    const shortPeriod = input.int(7, { title: '短周期', min: 1 })
    const middlePeriod = input.int(14, { title: '中周期', min: 1 })
    const longPeriod = input.int(28, { title: '长周期', min: 1 })
    const buyingPressure = derive('uo-bp', (_self, offset) => {
      const previous = close[offset + 1]
      if (Number.isNaN(previous)) return 0
      return close[offset] - Math.min(low[offset], previous)
    })
    const trueRange = derive('uo-tr', (_self, offset) => {
      const previous = close[offset + 1]
      if (Number.isNaN(previous)) return high[offset] - low[offset]
      return Math.max(high[offset], previous) - Math.min(low[offset], previous)
    })
    const shortRatio = ta.sum(buyingPressure, shortPeriod)[0] / ta.sum(trueRange, shortPeriod)[0]
    const middleRatio = ta.sum(buyingPressure, middlePeriod)[0] / ta.sum(trueRange, middlePeriod)[0]
    const longRatio = ta.sum(buyingPressure, longPeriod)[0] / ta.sum(trueRange, longPeriod)[0]
    plot.Line((100 * (4 * shortRatio + 2 * middleRatio + longRatio)) / 7, 'uo', {
      label: 'UO',
      color: Color.Blue,
    })
  },
})
