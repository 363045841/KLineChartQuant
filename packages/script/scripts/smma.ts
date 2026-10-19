// SMMA：Wilder 平滑均线（Pine 的 ta.rma），以完整窗口 SMA 初始化。
defineIndicator({
  name: 'SMMA',
  title: '平滑移动平均',
  info: 'SMMA（Wilder 平滑）用递归平滑过滤噪音，是 RSI/ATR 的内部算法，适合平滑趋势中的波动。',
  position: Position.Main,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    plot.Line(ta.rma(close, period), 'smma', { label: 'SMMA', color: Color.Purple })
  },
})
