// 双均线差 DIF 及其简单移动平均 AMA。
defineIndicator({
  name: 'DMA',
  position: Position.Sub,
  onBar() {
    const p1 = input.int(10, { title: '短周期', min: 1 })
    const p2 = input.int(50, { title: '长周期', min: 1 })
    const p3 = input.int(10, { title: '平均周期', min: 1 })
    const difference = derive(
      `dma:${p1}:${p2}`,
      (_self, offset) => ta.sma(close, p1)[offset] - ta.sma(close, p2)[offset],
    )
    plot.Line(difference, 'dif', { label: 'DIF', color: Color.Purple })
    plot.Line(ta.sma(difference, p3), 'ama', { label: 'AMA', color: Color.Blue })
  },
})
