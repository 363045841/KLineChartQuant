// OBV：按收盘价涨跌方向逐根累加成交量。
let obv = 0

defineIndicator({
  name: 'OBV',
  title: '能量潮',
  info: 'OBV 累积量能，价格上涨时加量，下跌时减量。OBV 趋势与价格背离常预示反转。',
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
