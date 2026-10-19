// StochRSI：RSI 再做随机指标，K/D 各做一次 SMA 平滑。
defineIndicator({
  name: 'StochRSI',
  title: '随机相对强弱指标',
  info: 'StochRSI 对 RSI 再做随机指标计算，比普通 RSI 更敏感，K/D 双线观察超买超卖。',
  position: Position.Sub,
  onBar() {
    const period = input.int(14, { title: 'RSI 周期', min: 2 })
    const kPeriod = input.int(3, { title: 'K 平滑', min: 1 })
    const dPeriod = input.int(3, { title: 'D 平滑', min: 1 })

    const rsi = ta.rsi(close, period)
    const rawK = ta.stoch(rsi, rsi, rsi, period)
    const k = ta.sma(rawK, kPeriod)
    const d = ta.sma(k, dPeriod)

    plot.Line(k, 'k', { label: 'K', color: Color.Orange })
    plot.Line(d, 'd', { label: 'D', color: Color.Blue })
    plot.Line(80, 'guide80', { label: '80', color: Color.Gray, dash: [4, 4] })
    plot.Line(20, 'guide20', { label: '20', color: Color.Gray, dash: [4, 4] })
  },
})
