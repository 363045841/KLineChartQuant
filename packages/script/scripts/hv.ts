// HV：对数收益率窗口的总体标准差，按年化周期折算为百分比。
defineIndicator({
  name: 'HV',
  title: '历史波动率',
  info: 'HV 衡量过去 N 日对数收益率的年化标准差，值越高表示市场波动越大。',
  position: Position.Sub,
  format: Format.Percent,
  onBar() {
    const period = input.int(20, { title: '周期', min: 1 })
    const annualization = input.int(252, { title: '年化周期', min: 1 })
    const logReturn = derive('hv-log-return', (_self, offset) => {
      const current = close[offset]
      const previous = close[offset + 1]
      return previous > 0 && current > 0 ? Math.log(current / previous) : Number.NaN
    })
    plot.Line(ta.stddev(logReturn, period)[0] * Math.sqrt(annualization) * 100, 'hv', {
      label: 'HV',
      color: Color.Purple,
    })
  },
})
