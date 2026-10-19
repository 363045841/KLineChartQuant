// 去趋势价格振荡器，以历史收盘价减去当前窗口均值观察价格周期。
defineIndicator({
  name: 'DPO',
  title: '区间震荡线',
  info: 'DPO 将价格与向前偏移的均线比较，用于剥离趋势、观察短周期摆动。',
  position: Position.Sub,
  onBar() {
    const period = input.int(20, { title: '周期', min: 1 })
    const shift = Math.floor(period / 2) + 1
    plot.Line(close[shift] - ta.sma(close, period)[0], 'dpo', { label: 'DPO', color: Color.Purple })
    plot.Line(0, 'zero', { label: '0', color: Color.Gray, dash: [4, 4] })
  },
})
