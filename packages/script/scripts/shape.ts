/** Shape 原生示例：按真实行情的 bar 轮流展示全部 12 种形状，可直接在脚本编辑器运行。 */
const styles = Object.values(ShapeStyle)
let barIndex: number = 0

defineIndicator({
  name: 'Shape 图形示例',
  pane: PaneKind.Main,
  inputs: {},
  plots: styles.map((style, index) => ({
    id: style,
    kind: PlotKind.Shape,
    style,
    location: index % 2 === 0 ? ShapeLocation.AboveBar : ShapeLocation.BelowBar,
    size: ShapeSize.Normal,
    text: style,
  })),
  onBar() {
    for (const [index, style] of styles.entries()) {
      plot.Shape(barIndex % styles.length === index, { id: style })
    }
    barIndex++
  },
})
