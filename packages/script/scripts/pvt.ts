// PVT：累计成交量乘以收盘价相对前一根的百分比变化。
let pvt = 0

defineIndicator({
  name: 'PVT',
  title: '价量趋势',
  info: 'PVT 将成交量按价格变化率加权累计，比 OBV 更精细，反映资金流入流出力度。',
  position: Position.Sub,
  format: Format.Volume,
  onBar() {
    const previous = close[1]
    if (!Number.isNaN(previous) && previous !== 0) pvt += ((close - previous) / previous) * volume
    plot.Line(pvt, 'pvt', { label: 'PVT', color: Color.Purple })
  },
})
