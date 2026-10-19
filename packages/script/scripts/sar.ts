// SAR：抛物线转向；按趋势、极值与加速因子递推，逐点按趋势着色。
let initialized = false
let rising = true
let sar = Number.NaN
let extreme = Number.NaN
let acceleration = 0

defineIndicator({
  name: 'SAR',
  position: Position.Main,
  onBar() {
    const step = input.float(0.02, { title: '加速步长', min: 0.0001 })
    const maxStep = input.float(0.2, { title: '最大加速', min: 0.0001 })
    const previousClose = close[1]
    if (Number.isNaN(previousClose)) return
    if (!initialized) {
      initialized = true
      rising = close >= previousClose
      sar = rising ? low[1] : high[1]
      extreme = rising ? high[1] : low[1]
      acceleration = step
    }
    sar = sar + acceleration * (extreme - sar)
    if (rising) {
      const first = low[1]
      const second = Number.isNaN(low[2]) ? first : low[2]
      sar = Math.min(sar, first, second)
    } else {
      const first = high[1]
      const second = Number.isNaN(high[2]) ? first : high[2]
      sar = Math.max(sar, first, second)
    }
    if (rising && low < sar) {
      rising = false
      sar = extreme
      extreme = low
      acceleration = step
    } else if (!rising && high > sar) {
      rising = true
      sar = extreme
      extreme = high
      acceleration = step
    } else if (rising && high > extreme) {
      extreme = high
      acceleration = Math.min(acceleration + step, maxStep)
    } else if (!rising && low < extreme) {
      extreme = low
      acceleration = Math.min(acceleration + step, maxStep)
    }
    plot.Point(sar, 'sar', {
      label: 'SAR',
      color: rising ? Color.Teal : Color.Red,
      size: ShapeSize.Small,
    })
  },
})
