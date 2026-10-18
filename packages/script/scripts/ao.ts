// 动量震荡指标：中位价的快慢 SMA 之差，按正负与增减着色。
defineIndicator({
  name: 'AO',
  position: Position.Sub,
  onBar() {
    const fast = input.int(5, { title: '快周期', min: 1 })
    const slow = input.int(34, { title: '慢周期', min: 1 })
    const midpoint = derive('ao:midpoint', (_self, offset) => (high[offset] + low[offset]) / 2)
    const value = derive(`ao:${fast}:${slow}`, (_self, offset) =>
      fast < slow ? ta.sma(midpoint, fast)[offset] - ta.sma(midpoint, slow)[offset] : Number.NaN,
    )
    const rising = Number.isNaN(value[1]) || value[0] >= value[1]
    const color =
      value[0] >= 0
        ? rising
          ? Color.Teal
          : Color.Teal + '80'
        : rising
          ? Color.Red + '80'
          : Color.Red
    plot.Columns(value[0], 'ao', { label: 'AO', color })
    plot.Line(0, 'zero', { label: '0', color: Color.Gray, dash: [4, 4] })
  },
})
