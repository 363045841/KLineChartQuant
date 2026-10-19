// ChaikinVol：高低价差的 EMA 变化率，衡量波幅的相对扩张与收缩。
defineIndicator({
  name: 'ChaikinVol',
  title: '蔡金波动率',
  info: 'Chaikin Volatility 衡量价格区间的宽度变化，波动率扩张预示突破，收缩预示盘整。',
  position: Position.Sub,
  format: Format.Percent,
  onBar() {
    const emaPeriod = input.int(10, { title: '均线周期', min: 1 })
    const rocPeriod = input.int(10, { title: '变化周期', min: 1 })
    const range = derive('chaikin-range', (_self, offset) => high[offset] - low[offset])
    const smoothed = ta.ema(range, emaPeriod)
    plot.LineBR(ta.roc(smoothed, rocPeriod)[0], 'chaikinVol', {
      label: 'ChaikinVol',
      color: Color.Orange,
    })
    plot.Line(0, 'guide', { label: '0', color: Color.Gray, dash: [4, 4] })
  },
})
