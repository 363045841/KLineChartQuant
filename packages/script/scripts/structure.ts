/** 市场结构：确认摆动点后标记 HH/HL/LH/LL，首次收盘突破区分 BOS 与 CHoCH。 */
let previousHigh = Number.NaN
let previousLow = Number.NaN
let swingHigh: SwingPoint | null = null
let swingLow: SwingPoint | null = null
let trend = 0

/** 已确认的摆动点；index 为图表下标，price 为极值。 */
type SwingPoint = { readonly index: number; readonly price: number }

/** 一次 onBar 的输入快照；helper 只读，不再从闭包捕获输入。 */
type StructureConfig = {
  readonly leftBars: number
  readonly rightBars: number
  readonly showSwings: boolean
  readonly showBos: boolean
  readonly showChoch: boolean
  readonly bullColor: string
  readonly bearColor: string
}

/** 标签相对锚点的垂直偏移（逻辑像素）：高点与突破位浮在上方，低点压在下方。 */
const LABEL_OFFSET = 8

/** 在任意历史价格位置放置文字，直接使用公共 Label API；offsetY 正数向上。 */
function mark(index: number, price: number, text: string, color: string, offsetY: number): void {
  label.new({ x: index, y: price, text, color, size: 11, offsetY })
}

/** 摆动点相对前一个同向点的标签。 */
function swingLabel(value: number, previous: number, highPoint: boolean): string {
  if (Number.isNaN(previous)) return highPoint ? 'H' : 'L'
  const higher = value > previous
  if (highPoint) return higher ? 'HH' : 'LH'
  return higher ? 'HL' : 'LL'
}

/** 更新最近确认的摆动点，并按需标注结构标签。 */
function trackSwings(config: StructureConfig): void {
  const pivotHigh = ta.pivothigh(high, config.leftBars, config.rightBars)[0]
  const pivotLow = ta.pivotlow(low, config.leftBars, config.rightBars)[0]
  const index = bar_index - config.rightBars
  if (Number.isFinite(pivotHigh)) {
    swingHigh = { index, price: pivotHigh }
    if (config.showSwings)
      mark(
        index,
        pivotHigh,
        swingLabel(pivotHigh, previousHigh, true),
        config.bearColor,
        LABEL_OFFSET,
      )
    previousHigh = pivotHigh
  }
  if (Number.isFinite(pivotLow)) {
    swingLow = { index, price: pivotLow }
    if (config.showSwings)
      mark(
        index,
        pivotLow,
        swingLabel(pivotLow, previousLow, false),
        config.bullColor,
        -LABEL_OFFSET,
      )
    previousLow = pivotLow
  }
}

/** 收盘价越过最近摆动点时给出突破点与方向；未突破返回 undefined。 */
function readBreakout(): { point: SwingPoint; direction: 1 | -1 } | undefined {
  if (swingHigh !== null && close[0] > swingHigh.price) return { point: swingHigh, direction: 1 }
  if (swingLow !== null && close[0] < swingLow.price) return { point: swingLow, direction: -1 }
  return undefined
}

/** 画突破线与 BOS/CHoCH 标签。 */
function drawBreak(
  config: StructureConfig,
  point: SwingPoint,
  direction: 1 | -1,
  reversal: boolean,
): void {
  const color = direction === 1 ? config.bullColor : config.bearColor
  line.new({
    x1: point.index,
    y1: point.price,
    x2: bar_index,
    y2: point.price,
    color,
    style: line.style_dashed,
  })
  mark(
    Math.floor((point.index + bar_index) / 2),
    point.price,
    reversal ? 'CHoCH' : 'BOS',
    color,
    LABEL_OFFSET,
  )
}

defineIndicator({
  name: 'Structure',
  title: '市场结构',
  position: Position.Main,
  info: '确认摆动点的 HH/HL/LH/LL，以及收盘首次突破的 BOS 和反向 CHoCH。',
  max_lines_count: 2000,
  max_labels_count: 2000,
  onBar() {
    const leftBars = input.int(5, { title: '左窗口', min: 1, max: 50 })
    const rightBars = input.int(2, { title: '确认窗口', min: 1, max: 50 })
    const showSwings = input.bool(true, { title: '显示摆动标签' })
    const showBOS = input.bool(true, { title: '显示 BOS' })
    const showCHoCH = input.bool(true, { title: '显示 CHoCH' })
    const bullColor = input.string(Color.Teal, { title: '多头颜色' })
    const bearColor = input.string(Color.Red, { title: '空头颜色' })
    const config: StructureConfig = {
      leftBars,
      rightBars,
      showSwings,
      showBos: showBOS,
      showChoch: showCHoCH,
      bullColor,
      bearColor,
    }
    trackSwings(config)
    const breakout = readBreakout()
    if (!breakout) return
    const reversal = trend !== 0 && trend !== breakout.direction
    if (reversal ? config.showChoch : config.showBos)
      drawBreak(config, breakout.point, breakout.direction, reversal)
    trend = breakout.direction
    if (breakout.direction === 1) swingHigh = null
    else swingLow = null
  },
})
