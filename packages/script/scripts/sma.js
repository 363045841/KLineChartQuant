// 收盘价移动平均，算法可选 SMA / EMA / WMA / VWMA；声明与计算都是编辑器中的完整源码。
defineIndicator({
  name: 'SMA',
  pane: PaneKind.Main,
  inputs: {
    period: input(20, { title: '周期' }),
    type: input('SMA', { title: '算法', options: ['SMA', 'EMA', 'WMA', 'VWMA'] }),
  },
  onBar() {
    const average = averageSeries(close, params.period, params.type)
    plot(PlotKind.Line, average[0], { id: 'sma' })
  },
})

/** 按算法名分派到对应的库函数；未知算法直接报错，不回退成别的均线。 */
function averageSeries(source, length, type) {
  switch (type) {
    case 'SMA':
      return ta.sma(source, length)
    case 'EMA':
      return ta.ema(source, length)
    case 'WMA':
      return ta.wma(source, length)
    case 'VWMA':
      return ta.vwma(source, volume, length)
  }
  throw new RangeError('未知的均线算法：' + type)
}
