// VIDYA：用 CMO 的绝对值缩放 EMA 平滑系数，趋势强时快、震荡时慢。
let vidya = Number.NaN

defineIndicator({
  name: 'VIDYA',
  title: '可变指数移动平均',
  info: 'VIDYA 用 CMO 自适应调整平滑系数，趋势强时快速跟随，震荡时平滑过滤。',
  position: Position.Main,
  onBar() {
    const period = input.int(14, { title: 'EMA 周期', min: 1 })
    const cmoPeriod = input.int(9, { title: 'CMO 周期', min: 1 })
    const cmo = ta.cmo(close, cmoPeriod)[0]
    if (Number.isNaN(cmo)) {
      plot.Line(null, 'vidya', { label: 'VIDYA', color: Color.Teal })
      return
    }
    const alpha = (2 / (period + 1)) * (Math.abs(cmo) / 100)
    vidya = Number.isNaN(vidya) ? close[0] : alpha * close[0] + (1 - alpha) * vidya
    plot.Line(vidya, 'vidya', { label: 'VIDYA', color: Color.Teal })
  },
})
