/** 数值箭头示例：方向表示涨跌，长度表示当前实体相对整条序列的强弱。 */
defineIndicator({
  name: 'Arrow Demo',
  pane: PaneKind.Main,
  inputs: {
    colorUp: input('#00c853', { title: '上涨颜色' }),
    colorDown: input('#d50000', { title: '下跌颜色' }),
  },
  onBar() {
    plot.Arrow(close - open, {
      id: 'body',
      colorUp: params.colorUp,
      colorDown: params.colorDown,
    })
  },
})
