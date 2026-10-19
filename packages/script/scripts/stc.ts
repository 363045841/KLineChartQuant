// STC：MACD 差值经两次随机化与 factor 平滑。
defineIndicator({
  name: 'STC',
  title: '夏夫趋势周期',
  info: 'STC 结合 MACD 与随机指标，在 0-100 区间判断趋势方向与周期相位。',
  position: Position.Sub,
  onBar() {
    const fast = input.int(23, { title: '快线', min: 2 })
    const slow = input.int(50, { title: '慢线', min: 3 })
    const cycle = input.int(10, { title: '周期', min: 2 })
    const factor = input.float(0.5, { title: '平滑因子', min: 0.05, max: 1, step: 0.05 })

    const dif = ta.macd(close, fast, slow, 1)[0]
    const firstRaw = ta.stoch(dif, dif, dif, cycle)
    const first = derive('stc:first', (self, offset) => {
      const raw = firstRaw.at(offset)
      if (Number.isNaN(raw)) return Number.NaN
      const previous = self.at(offset + 1)
      return Number.isNaN(previous) ? raw : previous + factor * (raw - previous)
    })

    const secondRaw = ta.stoch(first, first, first, cycle)
    const stc = derive('stc:second', (self, offset) => {
      const raw = secondRaw.at(offset)
      if (Number.isNaN(raw)) return Number.NaN
      const previous = self.at(offset + 1)
      return Number.isNaN(previous) ? raw : previous + factor * (raw - previous)
    })

    plot.Line(stc, 'stc', { label: 'STC', color: Color.Orange })
    plot.Line(75, 'guide75', { label: '75', color: Color.Gray, dash: [4, 4] })
    plot.Line(25, 'guide25', { label: '25', color: Color.Gray, dash: [4, 4] })
  },
})
