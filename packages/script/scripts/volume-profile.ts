/** 固定回看区间 VP：按高低区间重叠分配成交量，柱宽使用 bar 数。 */

/** 一次渲染的输入快照；helper 只读，不再从闭包捕获输入。 */
type VpConfig = {
  readonly lookback: number
  readonly bins: number
  readonly widthBars: number
  readonly valueAreaPercent: number
  readonly showPoc: boolean
  readonly showValueArea: boolean
  readonly profileColor: string
  readonly areaColor: string
  readonly pocColor: string
  readonly levelColor: string
}

/** 分箱在屏幕上的定位参数。 */
type VpLayout = {
  readonly left: number
  readonly bottom: number
  readonly step: number
  readonly width: number
}

/** 回看窗口的价格范围；只有窗口内出现过 high 与 low 才有意义。 */
function windowRange(count: number): { bottom: number; top: number } {
  let bottom = Infinity
  let top = -Infinity
  for (let offset = 0; offset < count; offset++) {
    bottom = Math.min(bottom, low[offset])
    top = Math.max(top, high[offset])
  }
  return { bottom, top }
}

/** 把每根 bar 的成交量按 OHLC 区间与分箱的重叠比例摊开。 */
function distributeVolume(count: number, bottom: number, step: number, bins: number): number[] {
  const volumes: number[] = new Array(bins).fill(0)
  for (let offset = 0; offset < count; offset++) {
    const amount = volume[offset]
    if (!Number.isFinite(amount) || amount <= 0) continue
    const lo = low[offset]
    const hi = high[offset]
    if (hi === lo) {
      const index = Math.min(bins - 1, Math.floor((close[offset] - bottom) / step))
      volumes[index]! += amount
      continue
    }
    const first = Math.max(0, Math.floor((lo - bottom) / step))
    const last = Math.min(bins - 1, Math.floor((hi - bottom) / step))
    for (let index = first; index <= last; index++) {
      const overlap =
        Math.min(hi, bottom + (index + 1) * step) - Math.max(lo, bottom + index * step)
      volumes[index]! += (amount * overlap) / (hi - lo)
    }
  }
  return volumes
}

/** 成交量最大的分箱；并列时取更低的档位。 */
function peakIndex(volumes: readonly number[]): number {
  let peak = 0
  for (let index = 1; index < volumes.length; index++)
    if (volumes[index]! > volumes[peak]!) peak = index
  return peak
}

/** 从 POC 向累积量更大的一侧扩张，直到覆盖目标占比。 */
function expandValueArea(
  volumes: readonly number[],
  peak: number,
  target: number,
): { lower: number; upper: number } {
  const last = volumes.length - 1
  let accumulated = volumes[peak]!
  let lower = peak
  let upper = peak
  while (accumulated < target && (lower > 0 || upper < last)) {
    const below = lower > 0 ? volumes[lower - 1]! : -Infinity
    const above = upper < last ? volumes[upper + 1]! : -Infinity
    if (above > below) accumulated += volumes[++upper]!
    else accumulated += volumes[--lower]!
  }
  return { lower, upper }
}

/** 画分布矩形；价值区内的分箱使用更深的填充色。 */
function drawProfile(
  config: VpConfig,
  layout: VpLayout,
  volumes: readonly number[],
  maximum: number,
  lower: number,
  upper: number,
): void {
  for (let index = 0; index < config.bins; index++) {
    const span = Math.round((volumes[index]! / maximum) * layout.width)
    if (span === 0) continue
    const inValueArea = config.showValueArea && index >= lower && index <= upper
    const color = inValueArea ? config.areaColor : config.profileColor
    box.new({
      left: layout.left,
      top: layout.bottom + (index + 1) * layout.step,
      right: layout.left + span,
      bottom: layout.bottom + index * layout.step,
      borderColor: color,
      borderWidth: 0,
      backgroundColor: color,
    })
  }
}

/** 画 POC 与价值区上下边界。 */
function drawLevels(
  config: VpConfig,
  layout: VpLayout,
  peak: number,
  lower: number,
  upper: number,
): void {
  if (config.showPoc) {
    const poc = layout.bottom + (peak + 0.5) * layout.step
    line.new({
      x1: layout.left,
      y1: poc,
      x2: bar_index,
      y2: poc,
      color: config.pocColor,
    })
  }
  if (!config.showValueArea) return
  const valueLow = layout.bottom + lower * layout.step
  const valueHigh = layout.bottom + (upper + 1) * layout.step
  line.new({
    x1: layout.left,
    y1: valueLow,
    x2: bar_index,
    y2: valueLow,
    color: config.levelColor,
    style: line.style_dashed,
  })
  line.new({
    x1: layout.left,
    y1: valueHigh,
    x2: bar_index,
    y2: valueHigh,
    color: config.levelColor,
    style: line.style_dashed,
  })
}

defineIndicator({
  name: 'VP',
  title: '成交量分布',
  position: Position.Main,
  info: '固定回看区间成交量分布；按 OHLC 区间近似分配成交量，并非逐笔成交价统计。',
  max_boxes_count: 100,
  max_lines_count: 3,
  onBar() {
    const lookback = input.int(100, { title: '回看根数', min: 2, max: 2000 })
    const bins = input.int(24, { title: '价格分箱', min: 5, max: 100 })
    const widthBars = input.int(30, { title: '最大柱宽（bar）', min: 1, max: 200 })
    const valueAreaPercent = input.float(70, { title: '价值区百分比', min: 1, max: 100 })
    const showPOC = input.bool(true, { title: '显示 POC' })
    const showValueArea = input.bool(true, { title: '显示 VAH / VAL' })
    const profileColor = input.string('rgba(33, 150, 243, 0.25)', { title: '分布颜色' })
    const areaColor = input.string('rgba(33, 150, 243, 0.55)', { title: '价值区颜色' })
    const pocColor = input.string(Color.Orange, { title: 'POC 颜色' })
    const levelColor = input.string(Color.Blue, { title: '价值区线颜色' })
    const config: VpConfig = {
      lookback,
      bins,
      widthBars,
      valueAreaPercent,
      showPoc: showPOC,
      showValueArea,
      profileColor,
      areaColor,
      pocColor,
      levelColor,
    }
    if (!barstate.islast) return
    const count = Math.min(config.lookback, bar_index + 1)
    const { bottom, top } = windowRange(count)
    if (!(top > bottom)) return
    const step = (top - bottom) / config.bins
    const volumes = distributeVolume(count, bottom, step, config.bins)
    const peak = peakIndex(volumes)
    const maximum = volumes[peak]!
    if (maximum <= 0) return
    const target =
      (volumes.reduce((sum, amount) => sum + amount, 0) * config.valueAreaPercent) / 100
    const { lower, upper } = expandValueArea(volumes, peak, target)
    const layout: VpLayout = {
      left: bar_index - count + 1,
      bottom,
      step,
      width: Math.min(config.widthBars, count - 1),
    }
    drawProfile(config, layout, volumes, maximum, lower, upper)
    drawLevels(config, layout, peak, lower, upper)
  },
})
