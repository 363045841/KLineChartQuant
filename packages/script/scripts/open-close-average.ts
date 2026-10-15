// 开收盘均价及高低价：均价到高低线的距离均小于阈值时，在均价处绘制 Shape。
defineIndicator({
  name: 'OC Average',
  pane: PaneKind.Sub,
  inputs: {
    n: input(2, { title: '除数' }),
    a: input(0, { title: '偏移量' }),
    distance: input(1, { title: '距离阈值（价格单位）' }),
  },
  onBar() {
    const average = (open[0] + close[0]) / params.n + params.a
    plot(PlotKind.Line, average, { id: 'oc-average' })
    plot(PlotKind.Line, high[0], { id: 'oc-high' })
    plot(PlotKind.Line, low[0], { id: 'oc-low' })
    const near =
      Math.abs(high[0] - average) < params.distance && Math.abs(average - low[0]) < params.distance
    if (near) {
      plot(PlotKind.Shape, average, {
        id: 'oc-near',
        style: ShapeStyle.TriangleUp,
        location: ShapeLocation.Absolute,
        size: ShapeSize.Small,
      })
    }
  },
})
