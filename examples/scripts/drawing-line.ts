/** line API 体验：最近一根 bar 更新线尾，历史每 20 根创建一条线；指标线不可选中或拖拽。 */
let activeLine: ReturnType<typeof line.new> | null = null

defineIndicator({
  version: 2,
  name: 'Drawing Line',
  position: Position.main,
  maxLinesCount: 50,
  onBar() {
    if (barIndex % 20 === 0) {
      activeLine = line.new(
        chart.point.now(close[0]),
        chart.point.fromIndex(barIndex + 10, close[0]),
        xloc.barIndex, extend.right, Color.blue, LineStyle.arrowRight, 2,
      )
    }
    if (activeLine === null) return
    line.setXY2(activeLine, barIndex + 1, close[0])
    line.setColor(activeLine, close[0] >= line.getY1(activeLine) ? Color.green : Color.red)
  },
})
