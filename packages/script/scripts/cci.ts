// 典型价格的顺势指标，参考线 ±100 与 0。
defineIndicator({
  name: 'CCI',
  title: '顺势指标',
  info: 'CCI 衡量价格相对统计平均的偏离程度，+100 以上常视为强势，-100 以下常视为弱势。',
  position: Position.Sub,
  onBar() {
    const period = input.int(14, { title: '周期', min: 1 })
    const typical = derive(
      'cci:typical',
      (_self, offset) => (high[offset] + low[offset] + close[offset]) / 3,
    )
    plot.Line(ta.cci(typical, period), 'cci', { label: 'CCI', color: Color.Purple })
    plot.Line(100, 'guideUpper', { label: '100', color: Color.Gray, dash: [4, 4] })
    plot.Line(0, 'zero', { label: '0', color: Color.Gray, dash: [4, 4] })
    plot.Line(-100, 'guideLower', { label: '-100', color: Color.Gray, dash: [4, 4] })
  },
})
