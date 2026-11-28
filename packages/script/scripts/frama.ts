// FRAMA：用收盘价区间的分形维数调整 EMA 平滑系数，逐 bar 递推。
const acc = state({ value: Number.NaN })

defineIndicator({
  version: 2,
  name: 'FRAMA',
  title: '分形自适应移动平均',
  info: 'FRAMA 用分形维度自适应调整平滑系数，趋势强时快，震荡时慢。',
  position: Position.main,
  onBar() {
    const period = input.int(16, { title: '周期', min: 4, max: 200, step: 2 })
    const half = period / 2
    if (period < 4 || period % 2 !== 0) {
      plot.Line(null, 'frama', { label: 'FRAMA', color: Color.blue })
      return
    }
    const fullHigh = ta.highest(close, period)[0]
    const fullLow = ta.lowest(close, period)[0]
    const firstHigh = ta.highest(close, half).at(half)
    const firstLow = ta.lowest(close, half).at(half)
    const secondHigh = ta.highest(close, half)[0]
    const secondLow = ta.lowest(close, half)[0]
    if (
      Number.isNaN(fullHigh) ||
      Number.isNaN(fullLow) ||
      Number.isNaN(firstHigh) ||
      Number.isNaN(firstLow) ||
      Number.isNaN(secondHigh) ||
      Number.isNaN(secondLow)
    ) {
      plot.Line(null, 'frama', { label: 'FRAMA', color: Color.blue })
      return
    }
    const n1 = (firstHigh - firstLow) / half
    const n2 = (secondHigh - secondLow) / half
    const n3 = (fullHigh - fullLow) / period
    let alpha: number
    if (n1 <= 0 || n2 <= 0 || n3 <= 0) {
      // 平盘窗口退化为普通 EMA 平滑系数。
      alpha = 2 / (period + 1)
    } else {
      const dimension = (Math.log(n1 + n2) - Math.log(n3)) / Math.LN2
      alpha = Math.exp(-4.6 * (dimension - 1))
      if (!(alpha > 0)) alpha = 0.01
      if (alpha > 1) alpha = 1
    }
    const current = close[0]
    acc.value = Number.isNaN(acc.value)
      ? current
      : alpha * current + (1 - alpha) * acc.value
    plot.Line(acc.value, 'frama', { label: 'FRAMA', color: Color.blue })
  },
})
