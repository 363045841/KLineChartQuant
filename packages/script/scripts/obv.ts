// OBV：按收盘价涨跌方向逐根累加成交量。
let obv = 0

defineIndicator({
  name: 'OBV',
  position: Position.Sub,
  format: Format.Volume,
  onBar() {
    const previous = close[1]
    if (!Number.isNaN(previous)) {
      if (close > previous) obv += volume
      else if (close < previous) obv -= volume
    }
    plot.Line(obv, 'obv', { label: 'OBV', color: Color.Blue })
  },
})
