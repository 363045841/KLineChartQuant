// 开收盘均价及高低价：输入声明和计算使用同一份脚本。
defineIndicator({
  name: 'OC Average',
  pane: PaneKind.Sub,
  inputs: {
    n: input(2, '除数'),
    a: input(0, '偏移量'),
  },
  onBar() {
    const average = (open[0] + close[0]) / params.n + params.a
    plot(PlotKind.Line, average, { id: 'oc-average' })
    plot(PlotKind.Line, high[0], { id: 'oc-high' })
    plot(PlotKind.Line, low[0], { id: 'oc-low' })
  },
})
