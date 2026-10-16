// Wilder RSI 三线；6/12/24 是周期族平行多线，可逐条隐藏，计算全部走 ta.rsi。
defineIndicator({
  name: 'RSI',
  pane: PaneKind.Sub,
  indicatorType: IndicatorType.Momentum,
  inputs: {
    period1: input(6, { title: '周期 1' }),
    period2: input(12, { title: '周期 2' }),
    period3: input(24, { title: '周期 3' }),
    showRSI1: input(true, { title: '显示 RSI 1' }),
    showRSI2: input(true, { title: '显示 RSI 2' }),
    showRSI3: input(true, { title: '显示 RSI 3' }),
  },
  onBar() {
    const periods = [params.period1, params.period2, params.period3]
    const shown = [params.showRSI1, params.showRSI2, params.showRSI3]
    const colors = [Color.Orange, Color.Blue, Color.Purple]
    for (let index = 0; index < periods.length; index++) {
      const period = periods[index]!
      if (!Number.isInteger(period) || period < 1) throw new RangeError('RSI 周期必须为正整数')
      // ta.rsi 在完整窗口之前返回 NaN，plot 会按空位过滤。
      plot.Line(shown[index] ? ta.rsi(close, period)[0] : null, {
        id: 'rsi' + (index + 1),
        label: 'RSI' + period,
        color: colors[index]!,
      })
    }
    for (const level of [80, 50, 20]) {
      plot.Line(level, {
        id: 'guide' + level,
        label: String(level),
        color: Color.Gray,
        dash: [4, 4],
      })
    }
  },
})
