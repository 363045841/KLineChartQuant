/** 数值箭头示例：方向表示涨跌，高度表示当前实体相对整条序列的强弱。 */
defineIndicator({
  name: 'Arrow Demo',
  pane: PaneKind.Main,
  inputs: {
    minHeight: input(5, { title: '最小高度' }),
    maxHeight: input(50, { title: '最大高度' }),
  },
  onBar() {
    plot(PlotKind.Arrow, close[0] - open[0], {
      id: 'body',
      minHeight: params.minHeight,
      maxHeight: params.maxHeight,
    })
  },
})
