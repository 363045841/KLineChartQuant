// Fisher Transform：中位价窗口归一化后做双极点递推，signal 为上一根 fisher。
let value = 0
let fisher = 0

defineIndicator({
  name: 'Fisher',
  title: '费雪变换',
  info: 'Fisher Transform 将价格分布高斯化，凸显拐点，transform 与 signal 双线交叉给出信号。',
  position: Position.Sub,
  onBar() {
    const period = input.int(10, { title: '周期', min: 2 })
    const median = derive('fisher:median', (_self, offset) => (high[offset] + low[offset]) / 2)
    const highest = ta.highest(median, period)[0]
    const lowest = ta.lowest(median, period)[0]

    if (Number.isNaN(highest) || Number.isNaN(lowest)) {
      plot.Line(null, 'fisher', { label: 'FISHER', color: Color.Orange })
      plot.Line(null, 'signal', { label: 'SIGNAL', color: Color.Blue })
      plot.Line(0, 'guide0', { label: '0', color: Color.Gray, dash: [4, 4] })
      return
    }

    const range = highest - lowest
    const normalized = range === 0 ? 0 : (median[0] - lowest) / range
    const raw = 2 * (normalized - 0.5)
    value = Math.min(0.999, Math.max(-0.999, 0.33 * raw + 0.67 * value))
    const signal = fisher
    fisher = 0.5 * Math.log((1 + value) / (1 - value)) + 0.5 * fisher

    plot.Line(fisher, 'fisher', { label: 'FISHER', color: Color.Orange })
    plot.Line(signal, 'signal', { label: 'SIGNAL', color: Color.Blue })
    plot.Line(0, 'guide0', { label: '0', color: Color.Gray, dash: [4, 4] })
  },
})
