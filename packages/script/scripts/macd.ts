/** MACD：TA 库计算 DIF/DEA，脚本保留翻倍柱体与正负、增减四色。 */
defineIndicator({
  name: 'MACD',
  position: Position.Sub,
  onBar() {
    const fastPeriod = input.int(12, { title: '快周期', min: 1 })
    const slowPeriod = input.int(26, { title: '慢周期', min: 1 })
    const signalPeriod = input.int(9, { title: '信号周期', min: 1 })
    const [dif, dea, histogram] = ta.macd(close, fastPeriod, slowPeriod, signalPeriod)
    const rising = Number.isNaN(histogram[1]) || histogram[0] >= histogram[1]
    const color = histogram[0] >= 0
      ? (rising ? Color.Teal : Color.Teal + '80')
      : (rising ? Color.Red + '80' : Color.Red)
    plot.Columns(histogram[0] * 2, 'bar', { label: 'BAR', color })
    plot.LineBR(dif[0], 'dif', { label: 'DIF', color: Color.Orange })
    plot.LineBR(dea[0], 'dea', { label: 'DEA', color: Color.Blue })
  },
})
