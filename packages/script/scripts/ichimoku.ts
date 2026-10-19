// 一目均衡表以区间中点、先行云带和迟行收盘价呈现趋势。
defineIndicator({
  name: 'Ichimoku',
  title: '一目均衡表',
  info: '一目均衡表用转换线、基准线、先行 span 与迟行线描述趋势、支撑阻力与未来均衡区。',
  position: Position.Main,
  onBar() {
    const tenkanPeriod = input.int(9, { title: '转换线周期', min: 1 })
    const kijunPeriod = input.int(26, { title: '基准线周期', min: 1 })
    const spanBPeriod = input.int(52, { title: '先行 B 周期', min: 1 })
    const displacement = input.int(26, { title: '位移', min: 0 })
    const tenkan = (ta.highest(high, tenkanPeriod)[0] + ta.lowest(low, tenkanPeriod)[0]) / 2
    const kijun = (ta.highest(high, kijunPeriod)[0] + ta.lowest(low, kijunPeriod)[0]) / 2
    const spanA = (tenkan + kijun) / 2
    const spanB = (ta.highest(high, spanBPeriod)[0] + ta.lowest(low, spanBPeriod)[0]) / 2
    plot.Line(tenkan, 'tenkan', { label: 'Tenkan', color: Color.Blue })
    plot.Line(kijun, 'kijun', { label: 'Kijun', color: Color.Red })
    const leadingA = plot.Line(spanA, 'spanA', {
      label: 'Span A',
      color: Color.Teal,
      offset: displacement,
    })
    const leadingB = plot.Line(spanB, 'spanB', {
      label: 'Span B',
      color: Color.Red,
      offset: displacement,
    })
    plot.Line(close[0], 'chikou', { label: 'Chikou', color: Color.Purple, offset: -displacement })
    fill(leadingA, leadingB, spanA >= spanB ? Color.Teal + '30' : Color.Red + '30', 'cloud')
  },
})
