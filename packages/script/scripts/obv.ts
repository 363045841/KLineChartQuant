// OBV：按收盘价涨跌方向逐根累加成交量。
const acc = state({ value: 0 })

defineIndicator({
  version: 2,
  name: 'OBV',
  title: '能量潮',
  info: 'OBV 累积量能，价格上涨时加量，下跌时减量。OBV 趋势与价格背离常预示反转。',
  position: Position.sub,
  format: Format.volume,
  onBar() {
    const previous = close[1]
    if (!Number.isNaN(previous)) {
      if (close > previous) acc.value += volume
      else if (close < previous) acc.value -= volume
    }
    plot.Line(acc.value, 'obv', { label: 'OBV', color: Color.blue })
  },
})
