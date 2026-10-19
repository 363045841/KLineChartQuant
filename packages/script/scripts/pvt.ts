// PVT：累计成交量乘以收盘价相对前一根的百分比变化。
let pvt = 0

defineIndicator({
  name: 'PVT',
  position: Position.Sub,
  format: Format.Volume,
  onBar() {
    const previous = close[1]
    if (!Number.isNaN(previous) && previous !== 0) pvt += ((close - previous) / previous) * volume
    plot.Line(pvt, 'pvt', { label: 'PVT', color: Color.Purple })
  },
})
