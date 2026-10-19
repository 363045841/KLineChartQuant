// VOL：逐根成交量柱，按收盘价相对前收的涨跌方向着色。
defineIndicator({
  name: 'VOL',
  title: '成交量',
  info: 'VOL 显示每根 K 线的成交量，用于观察量能变化与价格配合。',
  position: Position.Sub,
  format: Format.Volume,
  onBar() {
    const previous = close[1]
    const color =
      Number.isNaN(previous) || close === previous
        ? Color.Gray
        : close > previous
          ? Color.Green
          : Color.Red
    plot.Columns(volume, 'vol', { label: 'VOL', color })
  },
})
