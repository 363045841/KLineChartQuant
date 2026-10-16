/** 字符标记示例：上涨显示 ▲，下跌显示 ▼，相等时不显示。 */
defineIndicator({
  name: 'Char Demo',
  pane: PaneKind.Main,
  inputs: {},
  onBar() {
    plot.Char(close > open, {
      id: 'up',
      char: '▲',
      location: ShapeLocation.BelowBar,
      size: ShapeSize.Normal,
    })
    plot.Char(close < open, {
      id: 'down',
      char: '▼',
      location: ShapeLocation.AboveBar,
      size: ShapeSize.Normal,
    })
  },
})
