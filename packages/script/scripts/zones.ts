/** FVG 和 Order Block：形成后向当前 bar 延伸，远端边界完全填补后冻结或删除。 */
type Zone = { id: BoxRef; bull: boolean; high: number; low: number; active: boolean }
const zones: Zone[] = []
let swingHigh = Number.NaN
let swingLow = Number.NaN


defineIndicator({
  name: 'Zones', title: 'FVG 与订单块', position: Position.Main,
  info: '三根 K 线公允价值缺口与确认结构突破前的最近反向蜡烛订单块。',
  max_boxes_count: 200,
  onBar() {
    const showFVG = input.bool(true, { title: '显示 FVG' })
    const showOB = input.bool(true, { title: '显示 Order Block' })
    const keepMitigated = input.bool(false, { title: '保留已填补区域' })
    const swingLength = input.int(5, { title: '结构摆动窗口', min: 1, max: 50 })
    const obLookback = input.int(20, { title: 'OB 回看根数', min: 1, max: 200 })
    const maxZones = input.int(100, { title: '最多区域', min: 1, max: 200 })
    const bullFill = input.string('rgba(38, 166, 154, 0.18)', { title: '多头填充' })
    const bearFill = input.string('rgba(239, 83, 80, 0.18)', { title: '空头填充' })
    /** 为已确认区域建立无边框矩形，限额包含保留的历史区域。 */
    function addZone(left: number, top: number, bottom: number, bull: boolean, title: string): void {
      if (zones.length === maxZones) box.delete(zones.shift()!.id)
      const fill = bull ? bullFill : bearFill
      const id = box.new(left, top, bar_index, bottom, fill, 0, line.style_solid, extend.none, xloc.bar_index, fill, title)
      zones.push({ id, bull, high: top, low: bottom, active: true })
    }
    // 先推进已有区域；形成当根不立即判定自身已被填补。
    for (let i = zones.length - 1; i >= 0; i--) {
      const zone = zones[i]!
      if (!zone.active) continue
      box.set_right(zone.id, bar_index)
      if (zone.bull ? low[0] <= zone.low : high[0] >= zone.high) {
        zone.active = false
        if (!keepMitigated) { box.delete(zone.id); zones.splice(i, 1) }
      }
    }
    if (showFVG && bar_index >= 2) {
      if (low[0] > high[2]) addZone(bar_index - 2, low[0], high[2], true, 'FVG')
      if (high[0] < low[2]) addZone(bar_index - 2, low[2], high[0], false, 'FVG')
    }
    const ph = ta.pivothigh(high, swingLength, swingLength)[0]
    const pl = ta.pivotlow(low, swingLength, swingLength)[0]
    if (Number.isFinite(ph)) swingHigh = ph
    if (Number.isFinite(pl)) swingLow = pl
    const up = close[0] > swingHigh
    const down = close[0] < swingLow
    if (showOB && (up || down)) {
      for (let offset = 1; offset <= Math.min(obLookback, bar_index); offset++) {
        if (up ? close[offset] < open[offset] : close[offset] > open[offset]) {
          const top = high[offset]
          const bottom = low[offset]
          // 已在突破前被完全穿越的候选蜡烛不再作为有效订单块。
          let valid = true
          for (let recent = 0; recent < offset; recent++) {
            if (up ? low[recent] <= bottom : high[recent] >= top) { valid = false; break }
          }
          if (valid) addZone(bar_index - offset, top, bottom, up, 'OB')
          break
        }
      }
    }
    if (up) swingHigh = Number.NaN
    if (down) swingLow = Number.NaN
  },
})
