// VOL：逐根成交量柱，按收盘价相对前收的涨跌方向着色。
defineIndicator({
  version: 2,
  name: 'VOL',
  title: '成交量',
  info: 'VOL 显示每根 K 线的成交量，用于观察量能变化与价格配合。',
  position: Position.sub,
  format: Format.volume,
  onBar() {
    const previous = close[1]
    const color =
      Number.isNaN(previous) || close === previous
        ? Color.gray
        : close > previous
          ? Color.green
          : Color.red
    plot.Columns(volume, 'vol', { label: 'VOL', color })
  },
})
