// 收盘价简单移动平均；声明与计算都是编辑器中的完整源码。
defineIndicator({
  name: 'SMA',
  pane: 'main',
  inputs: {
    period: input(20, '周期'),
  },
  onBar() {
    const average = ta.sma(close, params.period)
    plot(average[0], PlotKind.Line, { id: 'sma' })
  },
})
