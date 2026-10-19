// 五组独立周期的收盘价简单移动平均。
defineIndicator({
  name: 'MA',
  title: '移动平均',
  info: 'MA 是简单移动平均，平滑价格并展示趋势方向；多条不同周期均线可观察排列与交叉。',
  position: Position.Main,
  onBar() {
    const period1 = input.int(5, { title: '周期 1', min: 1 })
    const period2 = input.int(10, { title: '周期 2', min: 1 })
    const period3 = input.int(20, { title: '周期 3', min: 1 })
    const period4 = input.int(30, { title: '周期 4', min: 1 })
    const period5 = input.int(60, { title: '周期 5', min: 1 })
    const showMA1 = input.bool(true, { title: '显示均线 1' })
    const showMA2 = input.bool(true, { title: '显示均线 2' })
    const showMA3 = input.bool(true, { title: '显示均线 3' })
    const showMA4 = input.bool(true, { title: '显示均线 4' })
    const showMA5 = input.bool(true, { title: '显示均线 5' })
    plot.Line(ta.sma(close, period1), 'ma1', {
      label: `MA${period1}`,
      color: Color.Orange,
      visible: showMA1,
    })
    plot.Line(ta.sma(close, period2), 'ma2', {
      label: `MA${period2}`,
      color: Color.Blue,
      visible: showMA2,
    })
    plot.Line(ta.sma(close, period3), 'ma3', {
      label: `MA${period3}`,
      color: Color.Purple,
      visible: showMA3,
    })
    plot.Line(ta.sma(close, period4), 'ma4', {
      label: `MA${period4}`,
      color: Color.Teal,
      visible: showMA4,
    })
    plot.Line(ta.sma(close, period5), 'ma5', {
      label: `MA${period5}`,
      color: Color.Red,
      visible: showMA5,
    })
  },
})
