/**
 * CVD（累积成交量差）：主动买量减主动卖量，按时间累加。
 *
 * 两种口径，按数据源能力自动选择：
 * - 精确：K 线自带主动买量（Binance），净差 = 2 × 主动买量 − 总量。
 * - 估算：K 线不分主动方向（Bybit / Bitget / Hyperliquid），用收盘在当根区间的位置代理方向。
 *
 * 两者不能混比。柱子是当根净差，线是累计值；每日开盘重新累计。
 */
let cumulative = 0

defineIndicator({
  name: 'CVD',
  title: '累积成交量差',
  info: 'CVD 累加主动买量与主动卖量之差，配合价格看背离：价格上涨但 CVD 不跟说明买方动能减弱。Binance 用 K 线自带的主动买量算精确值；其它交易所 K 线不分方向，用收盘位置估算，两条口径不能直接比大小。',
  position: Position.Sub,
  onBar() {
    // 每日开盘重新累计，避免曲线跨日无限增长；日内仍可比较背离
    if (timeframe.change('D')) cumulative = 0
    const barVolume = volume[0]
    const takerBuy = buyVolume[0]
    if (!Number.isFinite(barVolume) || barVolume < 0) {
      plot.Line(null, 'cvd', { label: 'CVD', color: Color.Orange })
      return
    }

    let delta: number
    if (Number.isFinite(takerBuy)) {
      // 精确：主动买 − 主动卖，主动卖 = 总量 − 主动买
      delta = 2 * takerBuy - barVolume
    } else {
      // 估算：收盘越靠近最高价，买方越主动
      const range = high - low
      if (!Number.isFinite(range) || range <= 0) {
        plot.Line(null, 'cvd', { label: 'CVD', color: Color.Orange })
        return
      }
      delta = barVolume * ((2 * (close - low)) / range - 1)
    }

    cumulative += delta
    plot.Columns(delta, 'delta', {
      label: 'DELTA',
      color: delta >= 0 ? Color.Teal + '80' : Color.Red + '80',
    })
    plot.Line(cumulative, 'cvd', { label: 'CVD', color: Color.Orange })
  },
})
