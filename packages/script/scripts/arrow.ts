/** 数值箭头示例：方向表示涨跌，长度表示当前实体相对整条序列的强弱。 */
defineIndicator({
  name: 'Arrow Demo',
  position: Position.Main,
  onBar() {
    const colorUp = input.string('#00c853', { title: '上涨颜色' })
    const colorDown = input.string('#d50000', { title: '下跌颜色' })
    plot.Arrow(close - open, 'body', {
      colorUp,
      colorDown,
    })
  },
})
