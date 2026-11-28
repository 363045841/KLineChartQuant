// SAR：抛物线转向；按趋势、极值与加速因子递推，逐点按趋势着色。
const acc = state({
  initialized: false,
  rising: true,
  sar: Number.NaN,
  extreme: Number.NaN,
  acceleration: 0,
})

defineIndicator({
  version: 2,
  name: 'SAR',
  title: '抛物线转向',
  info: 'SAR（Parabolic Stop and Reverse）通过抛物线轨迹跟踪趋势，提供动态止损和反转信号。',
  position: Position.main,
  onBar() {
    const step = input.float(0.02, { title: '加速步长', min: 0.0001 })
    const maxStep = input.float(0.2, { title: '最大加速', min: 0.0001 })
    const previousClose = close[1]
    if (Number.isNaN(previousClose)) return
    if (!acc.initialized) {
      acc.initialized = true
      acc.rising = close >= previousClose
      acc.sar = acc.rising ? low[1] : high[1]
      acc.extreme = acc.rising ? high[1] : low[1]
      acc.acceleration = step
    }
    acc.sar = acc.sar + acc.acceleration * (acc.extreme - acc.sar)
    if (acc.rising) {
      const first = low[1]
      const second = Number.isNaN(low[2]) ? first : low[2]
      acc.sar = Math.min(acc.sar, first, second)
    } else {
      const first = high[1]
      const second = Number.isNaN(high[2]) ? first : high[2]
      acc.sar = Math.max(acc.sar, first, second)
    }
    if (acc.rising && low < acc.sar) {
      acc.rising = false
      acc.sar = acc.extreme
      acc.extreme = low
      acc.acceleration = step
    } else if (!acc.rising && high > acc.sar) {
      acc.rising = true
      acc.sar = acc.extreme
      acc.extreme = high
      acc.acceleration = step
    } else if (acc.rising && high > acc.extreme) {
      acc.extreme = high
      acc.acceleration = Math.min(acc.acceleration + step, maxStep)
    } else if (!acc.rising && low < acc.extreme) {
      acc.extreme = low
      acc.acceleration = Math.min(acc.acceleration + step, maxStep)
    }
    plot.Point(acc.sar, 'sar', {
      label: 'SAR',
      color: acc.rising ? Color.teal : Color.red,
      size: ShapeSize.tiny,
    })
  },
})
