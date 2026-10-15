// KDJ：K 为窗口 RSV，D 为 K 的 m 周期均值，J = 3K - 2D。
const stochWindow: number[] = []
let stochSum = 0
defineIndicator({
  name: 'KDJ',
  pane: PaneKind.Sub,
  indicatorType: IndicatorType.Momentum,
  inputs: {
    n: input(9, { title: '窗口周期' }),
    m: input(3, { title: '平滑周期' }),
  },
  onBar() {
    if (!Number.isInteger(params.m) || params.m < 1) throw new RangeError('平滑周期必须为正整数')
    const upper = ta.highest(high, params.n)[0]
    const lower = ta.lowest(low, params.n)[0]
    const k = upper === lower ? 50 : (100 * (close[0] - lower)) / (upper - lower)
    if (Number.isFinite(k)) {
      stochWindow.push(k)
      stochSum += k
      if (stochWindow.length > params.m) stochSum -= stochWindow.shift()!
    }
    const ready = stochWindow.length === params.m
    const d = ready ? stochSum / params.m : Number.NaN
    plot.Line(ready ? k : null, { id: 'k', label: 'K', color: '#ffb74d' })
    plot.Line(d, { id: 'd', label: 'D', color: '#42a5f5' })
    plot.Line(ready ? 3 * k - 2 * d : null, { id: 'j', label: 'J', color: '#ab47bc' })
    for (const level of [80, 50, 20]) {
      plot.Line(level, {
        id: 'guide' + level,
        label: String(level),
        color: '#808080',
        dash: [4, 4],
      })
    }
  },
})
