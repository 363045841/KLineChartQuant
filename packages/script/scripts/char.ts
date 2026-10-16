/** 字符标记示例：上涨显示 ▲，下跌显示 ▼，相等时不显示。 */
defineIndicator({
  name: 'Char Demo',
  position: Position.Main,
  onBar() {
    plot.Char(close > open, 'up', {
      char: '▲',
      location: ShapeLocation.BelowBar,
      size: ShapeSize.Normal,
    })
    plot.Char(close < open, 'down', {
      char: '▼',
      location: ShapeLocation.AboveBar,
      size: ShapeSize.Normal,
    })
  },
})
