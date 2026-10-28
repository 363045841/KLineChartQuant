// KDJ：K 为窗口 RSV，D 为 K 的 m 周期均值，J = 3K - 2D。
// 超买/超卖参考线是图表级声明，不参与数据列与数值范围。
for (const level of [80, 50, 20])
  hline(level, { color: Color.Gray, linestyle: HLineStyle.style_dashed })

defineIndicator({
  name: 'KDJ',
  title: 'KDJ',
  info: 'KDJ 通过比较收盘价与近期价格区间判断超买超卖。K、D、J 三线可用于观察动量与交叉信号。',
  position: Position.Sub,
  onBar() {
    const n = input.int(9, { title: '窗口周期', min: 1 })
    const m = input.int(3, { title: '平滑周期', min: 1 })
    const k = ta.stoch(close, high, low, n)
    const d = ta.sma(k, m)
    const ready = !Number.isNaN(d[0])
    plot.LineBR(ready ? k : null, 'k', { label: 'K', color: Color.Orange })
    plot.Line(d, 'd', { label: 'D', color: Color.Blue })
    plot.LineBR(ready ? 3 * k - 2 * d : null, 'j', { label: 'J', color: Color.Purple })
  },
})
