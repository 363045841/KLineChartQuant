// Wilder RSI 三线；6/12/24 是周期族平行多线，可逐条隐藏，计算全部走 ta.rsi。
defineIndicator({
  name: 'RSI',
  position: Position.Sub,
  onBar() {
    const period1 = input.int(6, { title: '周期 1', min: 1 })
    const period2 = input.int(12, { title: '周期 2', min: 1 })
    const period3 = input.int(24, { title: '周期 3', min: 1 })
    const showRSI1 = input.bool(true, { title: '显示 RSI 1' })
    const showRSI2 = input.bool(true, { title: '显示 RSI 2' })
    const showRSI3 = input.bool(true, { title: '显示 RSI 3' })
    const periods = [period1, period2, period3]
    const shown = [showRSI1, showRSI2, showRSI3]
    const colors = [Color.Orange, Color.Blue, Color.Purple]
    for (let index = 0; index < periods.length; index++) {
      const period = periods[index]!
      if (!Number.isInteger(period) || period < 1) throw new RangeError('RSI 周期必须为正整数')
      // ta.rsi 在完整窗口之前返回 NaN，plot 会按空位过滤。
      plot.LineBR(shown[index] ? ta.rsi(close, period) : null, 'rsi' + (index + 1), {
        label: 'RSI' + period,
        color: colors[index]!,
      })
    }
    for (const level of [80, 50, 20]) {
      plot.Line(level, 'guide' + level, {
        label: String(level),
        color: Color.Gray,
        dash: [4, 4],
      })
    }
  },
})
