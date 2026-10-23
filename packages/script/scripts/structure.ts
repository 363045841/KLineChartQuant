/** 市场结构：确认摆动点后标记 HH/HL/LH/LL，首次收盘突破区分 BOS 与 CHoCH。 */
let previousHigh = Number.NaN
let previousLow = Number.NaN
let swingHigh: { index: number; price: number } | null = null
let swingLow: { index: number; price: number } | null = null
let trend = 0

/** 在任意历史价格位置放置文字，直接使用公共 Label API。 */
function mark(index: number, price: number, text: string, color: string): void {
  label.new(index, price, text, xloc.bar_index, yloc.price, color, label.style_none, color, 11)
}

defineIndicator({
  name: 'Structure', title: '市场结构', position: Position.Main,
  info: '确认摆动点的 HH/HL/LH/LL，以及收盘首次突破的 BOS 和反向 CHoCH。',
  max_lines_count: 200, max_labels_count: 400,
  onBar() {
    const leftBars = input.int(5, { title: '左窗口', min: 1, max: 50 })
    const rightBars = input.int(2, { title: '确认窗口', min: 1, max: 50 })
    const showSwings = input.bool(true, { title: '显示摆动标签' })
    const showBOS = input.bool(true, { title: '显示 BOS' })
    const showCHoCH = input.bool(true, { title: '显示 CHoCH' })
    const bullColor = input.string(Color.Teal, { title: '多头颜色' })
    const bearColor = input.string(Color.Red, { title: '空头颜色' })
    const pivotHigh = ta.pivothigh(high, leftBars, rightBars)[0]
    const pivotLow = ta.pivotlow(low, leftBars, rightBars)[0]
    const index = bar_index - rightBars
    if (Number.isFinite(pivotHigh)) {
      swingHigh = { index, price: pivotHigh }
      if (showSwings) mark(index, pivotHigh, Number.isNaN(previousHigh) ? 'H' : pivotHigh > previousHigh ? 'HH' : 'LH', bearColor)
      previousHigh = pivotHigh
    }
    if (Number.isFinite(pivotLow)) {
      swingLow = { index, price: pivotLow }
      if (showSwings) mark(index, pivotLow, Number.isNaN(previousLow) ? 'L' : pivotLow > previousLow ? 'HL' : 'LL', bullColor)
      previousLow = pivotLow
    }
    const up = swingHigh !== null && close[0] > swingHigh.price
    const down = swingLow !== null && close[0] < swingLow.price
    const level = up ? swingHigh : down ? swingLow : null
    if (!level) return
    const direction = up ? 1 : -1
    const reversal = trend !== 0 && trend !== direction
    if (reversal ? showCHoCH : showBOS) {
      const color = up ? bullColor : bearColor
      line.new(level.index, level.price, bar_index, level.price, xloc.bar_index, extend.none, color, line.style_dashed)
      mark(Math.floor((level.index + bar_index) / 2), level.price, reversal ? 'CHoCH' : 'BOS', color)
    }
    trend = direction
    if (up) swingHigh = null
    else swingLow = null
  },
})
