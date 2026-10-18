// KDJ：K 为窗口 RSV，D 为 K 的 m 周期均值，J = 3K - 2D。
const stochWindow: number[] = []
let stochSum = 0
defineIndicator({
  name: 'KDJ',
  position: Position.Sub,
  onBar() {
    const n = input.int(9, { title: '窗口周期', min: 1 })
    const m = input.int(3, { title: '平滑周期', min: 1 })
    if (!Number.isInteger(m) || m < 1) throw new RangeError('平滑周期必须为正整数')
    const upper = ta.highest(high, n)
    const lower = ta.lowest(low, n)
    const k = upper === lower ? 50 : (100 * (close - lower)) / (upper - lower)
    if (Number.isFinite(k)) {
      stochWindow.push(k)
      stochSum += k
      if (stochWindow.length > m) stochSum -= stochWindow.shift()!
    }
    const ready = stochWindow.length === m
    const d = ready ? stochSum / m : Number.NaN
    plot.LineBR(ready ? k : null, 'k', { label: 'K', color: Color.Orange })
    plot.Line(d, 'd', { label: 'D', color: Color.Blue })
    plot.LineBR(ready ? 3 * k - 2 * d : null, 'j', { label: 'J', color: Color.Purple })
    for (const level of [80, 50, 20]) {
      plot.Line(level, 'guide' + level, {
        label: String(level),
        color: Color.Gray,
        dash: [4, 4],
      })
    }
  },
})
