// SMMA：Wilder 平滑均线（Pine 的 ta.rma），以完整窗口 SMA 初始化。
defineIndicator({
  name: 'SMMA',
  position: Position.Main,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    plot.Line(ta.rma(close, period), 'smma', { label: 'SMMA', color: Color.Purple })
  },
})
