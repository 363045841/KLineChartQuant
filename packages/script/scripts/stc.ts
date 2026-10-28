// STC：MACD 差值经两次随机化与 factor 平滑。
// 超买/超卖参考线是图表级声明，不参与数据列与数值范围。
hline(75, { color: Color.Gray, linestyle: HLineStyle.style_dashed })
hline(25, { color: Color.Gray, linestyle: HLineStyle.style_dashed })

/** 固定 factor 的一阶指数平滑；首个有效值作为起点，空值留空。 */
function smooth(key: string, raw: Series, factor: number): Series {
  return derive(key, (self, offset) => {
    const value = raw.at(offset)
    if (Number.isNaN(value)) return Number.NaN
    const previous = self.at(offset + 1)
    return Number.isNaN(previous) ? value : previous + factor * (value - previous)
  })
}

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
    const first = smooth('stc:first', ta.stoch(dif, dif, dif, cycle), factor)
    const stc = smooth('stc:second', ta.stoch(first, first, first, cycle), factor)

    plot.Line(stc, 'stc', { label: 'STC', color: Color.Orange })
  },
})
