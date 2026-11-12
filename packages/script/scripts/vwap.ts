// VWAP：按交易日锚定的成交量加权均价；成交量不可用时留空，不用典型价冒充。
let sumPriceVolume = 0
let sumVolume = 0

defineIndicator({
  name: 'VWAP',
  title: '成交量加权均价',
  info: 'VWAP（Volume-Weighted Average Price）以成交量加权的均价线，机构常用作日内交易基准；每个交易日开盘重新累计。',
  position: Position.Main,
  onBar() {
    // 交易日切换时清零；首根 bar 也返回 true，与 Pine 的 na(src[1]) 分支一致。
    if (timeframe.change('D')) {
      sumPriceVolume = 0
      sumVolume = 0
    }
    const typical = (high + low + close) / 3
    const barVolume = volume[0]
    // 成交量缺失或为负说明数据源不可用：当前 bar 留空并跳过累加，避免 NaN 污染整条序列。
    if (!Number.isFinite(typical) || !Number.isFinite(barVolume) || barVolume < 0) {
      plot.Line(null, 'vwap', { label: 'VWAP', color: Color.Orange })
      return
    }
    sumPriceVolume += typical * barVolume
    sumVolume += barVolume
    plot.Line(sumVolume > 0 ? sumPriceVolume / sumVolume : null, 'vwap', {
      label: 'VWAP',
      color: Color.Orange,
    })
    if (barstate.islast && sumVolume === 0)
      console.error('VWAP：数据源未提供成交量，无法计算 VWAP。')
  },
})
