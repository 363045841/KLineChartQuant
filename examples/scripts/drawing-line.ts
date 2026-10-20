/** line API 体验：最近一根 bar 更新线尾，历史每 20 根创建一条线；指标线不可选中或拖拽。 */
let activeLine: ReturnType<typeof line.new> | null = null

defineIndicator({
  name: 'Drawing Line',
  position: Position.Main,
  max_lines_count: 50,
  onBar() {
    if (bar_index % 20 === 0) {
      activeLine = line.new(
        chart.point.now(close[0]),
        chart.point.from_index(bar_index + 10, close[0]),
        xloc.bar_index, extend.right, Color.Blue, line.style_arrow_right, 2,
      )
    }
    if (activeLine === null) return
    line.set_xy2(activeLine, bar_index + 1, close[0])
    line.set_color(activeLine, close[0] >= line.get_y1(activeLine) ? Color.Green : Color.Red)
  },
})
