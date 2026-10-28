/** MDD：回看窗口内的最大回撤；负对数收益的最大子段和定位峰谷，再按价格算算术回撤。 */
defineIndicator({
  name: 'MDD',
  title: '最大回撤',
  info: '回看窗口内从峰值到谷底的最大回撤幅度，按区间两端的收盘价计算。',
  position: Position.Sub,
  format: Format.Percent,
  onBar() {
    const lookback = input.int(120, { title: '回看根数', min: 2, max: 2000 })
    // 负对数收益可加，最大子段和的端点即峰值与谷底。
    const decline = derive('mdd-decline', (_self, offset) => {
      const current = close[offset]
      const previous = close[offset + 1]
      return current > 0 && previous > 0 ? -Math.log(current / previous) : Number.NaN
    })
    const runs = ta.maxsum(decline, lookback)
    let depth = Number.NaN
    // 子段 [start..end] 对应从 start−1 根（峰值）跌到 end 根（谷底）。
    if (Number.isFinite(runs[1][0]) && Number.isFinite(runs[2][0])) {
      const peak = close[-(runs[1][0] - 1)]
      const trough = close[-runs[2][0]]
      depth = (1 - trough / peak) * 100
    }
    plot.Line(depth, 'mdd', { label: 'MDD', color: Color.Red })
  },
})
