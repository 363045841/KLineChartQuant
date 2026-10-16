// 开收盘均价及高低价：均价到高低线的距离均小于阈值时，在均价处绘制 Shape。
defineIndicator({
  name: 'OC Average',
  position: Position.Sub,
  onBar() {
    const n = input.float(2, { title: '除数' })
    const a = input.float(0, { title: '偏移量' })
    const distance = input.float(1, { title: '距离阈值（价格单位）' })
    const average = (open + close) / n + a
    plot.Line(average, 'oc-average')
    plot.Line(high, 'oc-high')
    plot.Line(low, 'oc-low')
    const near =
      Math.abs(high - average) < distance && Math.abs(average - low) < distance
    if (near) {
      plot.Shape(average, 'oc-near', {
        style: ShapeStyle.TriangleUp,
        location: ShapeLocation.Absolute,
        size: ShapeSize.Small,
      })
    }
  },
})
