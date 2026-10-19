// 以前一根 K 线的高低收盘计算经典枢轴点及三组支撑阻力。
defineIndicator({
  name: 'Pivot',
  title: '枢轴点',
  info: 'Pivot 根据前一根 K 线计算经典枢轴点与支撑阻力位，用于日内关键价位参考。',
  position: Position.Main,
  onBar() {
    const previousHigh = high[1]
    const previousLow = low[1]
    const pivot = (previousHigh + previousLow + close[1]) / 3
    const range = previousHigh - previousLow
    plot.StepLine(pivot, 'pp', { label: 'PP', color: Color.Orange })
    plot.StepLine(2 * pivot - previousLow, 'r1', { label: 'R1', color: Color.Red })
    plot.StepLine(pivot + range, 'r2', { label: 'R2', color: Color.Red })
    plot.StepLine(previousHigh + 2 * (pivot - previousLow), 'r3', { label: 'R3', color: Color.Red })
    plot.StepLine(2 * pivot - previousHigh, 's1', { label: 'S1', color: Color.Teal })
    plot.StepLine(pivot - range, 's2', { label: 'S2', color: Color.Teal })
    plot.StepLine(previousLow - 2 * (previousHigh - pivot), 's3', {
      label: 'S3',
      color: Color.Teal,
    })
  },
})
