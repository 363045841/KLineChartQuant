// Parkinson：高低价对数平方窗口均值的波动率估计，按年化周期折算为百分比。
defineIndicator({
  name: 'Parkinson',
  title: '帕金森波动率',
  info: 'Parkinson 利用最高最低价估算波动率，比 HV 更高效，捕捉日内波动范围。',
  position: Position.Sub,
  format: Format.Percent,
  onBar() {
    const period = input.int(20, { title: '周期', min: 1 })
    const annualization = input.int(252, { title: '年化周期', min: 1 })
    const squaredRange = derive('parkinson-range', (_self, offset) => {
      const high0 = high[offset]
      const low0 = low[offset]
      if (!(high0 > 0) || !(low0 > 0)) return 0
      const logarithm = Math.log(high0 / low0)
      return logarithm * logarithm
    })
    const mean = ta.sma(squaredRange, period)[0]
    plot.Line(Math.sqrt(mean / (4 * Math.LN2)) * Math.sqrt(annualization) * 100, 'parkinson', {
      label: 'Parkinson',
      color: Color.Teal,
    })
  },
})
