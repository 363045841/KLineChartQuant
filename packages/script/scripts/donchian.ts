// 唐奇安通道：窗口最高价、最低价与二者中点。
defineIndicator({
  name: 'Donchian',
  pane: PaneKind.Main,
  indicatorType: IndicatorType.Channel,
  inputs: {
    period: input(20, { title: '周期' }),
  },
  onBar() {
    const upper = ta.highest(high, params.period)[0]
    const lower = ta.lowest(low, params.period)[0]
    plot(PlotKind.Line, upper, { id: 'upper', label: 'UPPER', color: '#ab47bc' })
    plot(PlotKind.Line, (upper + lower) / 2, { id: 'middle', label: 'MID', color: '#ffb74d' })
    plot(PlotKind.Line, lower, { id: 'lower', label: 'LOWER', color: '#ab47bc' })
  },
})
