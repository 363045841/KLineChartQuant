/** BIS：回看窗口内最强的一段连续上涨；对数收益的最大子段和换算成累计涨幅。 */
defineIndicator({
  name: 'BIS',
  title: '最强连续区间',
  info: '回看窗口内累计涨幅最大的连续区间，衡量趋势的含金量。',
  position: Position.Sub,
  format: Format.Percent,
  onBar() {
    const lookback = input.int(120, { title: '回看根数', min: 2, max: 2000 })
    // 对数收益可加，最大子段和因此就是区间累计涨幅的对数。
    const logReturn = derive('bis-log-return', (_self, offset) => {
      const current = close[offset]
      const previous = close[offset + 1]
      return current > 0 && previous > 0 ? Math.log(current / previous) : Number.NaN
    })
    const best = ta.maxsum(logReturn, lookback)[0][0]
    plot.Line((Math.exp(best) - 1) * 100, 'bis', { label: 'BIS', color: Color.Purple })
  },
})
