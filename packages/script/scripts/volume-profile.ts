/** 固定回看区间 VP：按高低区间重叠分配成交量，柱宽使用 bar 数。 */

defineIndicator({
  name: 'VP', title: '成交量分布', position: Position.Main,
  info: '固定回看区间成交量分布；按 OHLC 区间近似分配成交量，并非逐笔成交价统计。',
  max_boxes_count: 100, max_lines_count: 3,
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
    if (!barstate.islast) return
    const count = Math.min(lookback, bar_index + 1)
    let bottom = Infinity
    let top = -Infinity
    for (let offset = 0; offset < count; offset++) {
      bottom = Math.min(bottom, low[offset])
      top = Math.max(top, high[offset])
    }
    if (!(top > bottom)) return
    const step = (top - bottom) / bins
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
        const overlap = Math.min(hi, bottom + (index + 1) * step) - Math.max(lo, bottom + index * step)
        volumes[index]! += amount * overlap / (hi - lo)
      }
    }
    let peak = 0
    for (let i = 1; i < bins; i++) if (volumes[i]! > volumes[peak]!) peak = i
    const maximum = volumes[peak]!
    if (maximum <= 0) return
    const target = volumes.reduce((sum, amount) => sum + amount, 0) * valueAreaPercent / 100
    let accumulated = maximum
    let lower = peak
    let upper = peak
    while (accumulated < target && (lower > 0 || upper < bins - 1)) {
      const below = lower > 0 ? volumes[lower - 1]! : -Infinity
      const above = upper < bins - 1 ? volumes[upper + 1]! : -Infinity
      if (above > below) accumulated += volumes[++upper]!
      else accumulated += volumes[--lower]!
    }
    const left = bar_index - count + 1
    const width = Math.min(widthBars, count - 1)
    for (let i = 0; i < bins; i++) {
      const span = Math.round(volumes[i]! / maximum * width)
      if (span === 0) continue
      const color = showValueArea && i >= lower && i <= upper ? areaColor : profileColor
      box.new(left, bottom + (i + 1) * step, left + span, bottom + i * step, color, 0, line.style_solid, extend.none, xloc.bar_index, color)
    }
    if (showPOC) {
      const poc = bottom + (peak + 0.5) * step
      line.new(left, poc, bar_index, poc, xloc.bar_index, extend.none, pocColor)
    }
    if (showValueArea) {
      const val = bottom + lower * step
      const vah = bottom + (upper + 1) * step
      line.new(left, val, bar_index, val, xloc.bar_index, extend.none, levelColor, line.style_dashed)
      line.new(left, vah, bar_index, vah, xloc.bar_index, extend.none, levelColor, line.style_dashed)
    }
  },
})
