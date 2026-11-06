/** SVP/PVP共享脚本库：分段、成交量分箱、价值区及公共box/line输出；宿主不包含指标算法。 */
type ProfileBar = { time: number; end: number; open: number; high: number; low: number; close: number; volume: number; key: number }
type ProfileConfig = { rows: number; area: number; width: number; side: string; mode: string; showPoc: boolean; showVah: boolean; showVal: boolean; extendPoc: boolean; extendVah: boolean; extendVal: boolean; count: number; keep: number }

/** 逐bar收集的输入只保留数据，末根一次输出；每次脚本重算独立持有。 */
const profileBars: ProfileBar[] = []

/** 追加已按主图bar分组的低周期明细，边界在明细上下文求值，周线内也能分出不同session。 */
function collectProfile(times: readonly number[], ends: readonly number[], opens: readonly number[], highs: readonly number[], lows: readonly number[], closes: readonly number[], volumes: readonly number[], keys: readonly number[]): void {
  for (let i = 0; i < times.length; i++) {
    if (!Number.isFinite(keys[i])) continue
    profileBars.push({ time: times[i]!, end: ends[i]!, open: opens[i]!, high: highs[i]!, low: lows[i]!, close: closes[i]!, volume: volumes[i]!, key: keys[i]! })
  }
}

/** 一段的聚合结果；单价成交落入最高桶时也要保留总量。 */
function buildProfile(bars: readonly ProfileBar[], rows: number, area: number) {
  let bottom = Infinity
  let top = -Infinity
  for (const bar of bars) { bottom = Math.min(bottom, bar.low); top = Math.max(top, bar.high) }
  if (!(top > bottom)) return undefined
  const step = (top - bottom) / rows
  const up = new Array<number>(rows).fill(0)
  const down = new Array<number>(rows).fill(0)
  for (const bar of bars) {
    if (!Number.isFinite(bar.volume) || bar.volume <= 0) continue
    const output = bar.close >= bar.open ? up : down
    const span = bar.high - bar.low
    if (span <= 0) { output[Math.min(rows - 1, Math.max(0, Math.floor((bar.close - bottom) / step)))]! += bar.volume; continue }
    const first = Math.max(0, Math.floor((bar.low - bottom) / step))
    const last = Math.min(rows - 1, Math.floor((bar.high - bottom) / step))
    for (let row = first; row <= last; row++) {
      const overlap = Math.max(0, Math.min(bar.high, bottom + (row + 1) * step) - Math.max(bar.low, bottom + row * step))
      output[row]! += bar.volume * overlap / span
    }
  }
  const totals = up.map((amount, i) => amount + down[i]!)
  const total = totals.reduce((sum, amount) => sum + amount, 0)
  if (!(total > 0)) return undefined
  let poc = 0
  for (let i = 1; i < rows; i++) if (totals[i]! > totals[poc]!) poc = i
  let lo = poc
  let hi = poc
  let covered = totals[poc]!
  while (covered < total * area / 100 && (lo > 0 || hi < rows - 1)) {
    const upper = (totals[hi + 1] ?? 0) + (totals[hi + 2] ?? 0)
    const lower = (totals[lo - 1] ?? 0) + (totals[lo - 2] ?? 0)
    // 空桶不代表分布结束；跨过它们才能达到目标覆盖率。
    const upward = lo === 0 || (hi < rows - 1 && upper >= lower)
    const boundary = upward ? Math.min(rows - 1, hi + 2) : Math.max(0, lo - 2)
    if (upward) { for (let i = hi + 1; i <= boundary; i++) covered += totals[i]!; hi = boundary }
    else { for (let i = lo - 1; i >= boundary; i--) covered += totals[i]!; lo = boundary }
  }
  return { bottom, top, step, up, down, totals, poc, lo, hi, maximum: Math.max(...totals), maxDelta: Math.max(...up.map((value, i) => Math.abs(value - down[i]!))) }
}

/** 用时间坐标输出无边框横条；小数宽度只在最后转换成整数毫秒。 */
function profileBox(left: number, right: number, bottom: number, top: number, color: string): void {
  if (!(right > left)) return
  box.new({ left: Math.round(left), right: Math.round(right), top, bottom, xloc: xloc.bar_time, borderWidth: 0, borderColor: color, backgroundColor: color })
}

/** 参考线延伸到后续第一根覆盖价格的明细；未触及时使用公共right延长语义。 */
function profileLine(start: number, end: number, price: number, color: string, extended: boolean): void {
  let touched = false
  if (extended) {
    for (const bar of profileBars) {
      if (bar.time < end || price < bar.low || price > bar.high) continue
      end = bar.end
      touched = true
      break
    }
  }
  line.new({ x1: start, x2: end, y1: price, y2: price, xloc: xloc.bar_time, color, extend: extended && !touched ? extend.right : extend.none })
}

/** 按原生周期边界分组并合并N期；对象预算由行数与保留期数一起控制，绝不丢半张分布。 */
function renderProfiles(config: ProfileConfig): void {
  const natural: ProfileBar[][] = []
  for (const bar of profileBars) {
    let group = natural[natural.length - 1]
    if (!group || group[0]!.key !== bar.key) { group = []; natural.push(group) }
    group.push(bar)
  }
  const groups: ProfileBar[][] = []
  for (let i = 0; i < natural.length; i += config.count) groups.push(natural.slice(i, i + config.count).flat())
  const keep = Math.max(1, Math.min(config.keep, Math.floor(2000 / (config.rows * 2 + 1))))
  if (groups.length > keep) console.info(`成交量分布保留最近${keep}期（绘图对象预算）`)
  if (!profileBars.length) throw new Error('没有可用的低周期成交量明细，请检查行情源及计算周期')
  for (const group of groups.slice(-keep)) {
    const profile = buildProfile(group, config.rows, config.area)
    if (!profile) continue
    const first = group[0]!
    const last = group[group.length - 1]!
    const width = (last.end - first.time) * config.width / 100
    const left = config.side === 'left' ? first.time : last.end - width
    profileBox(left, left + width, profile.bottom, profile.top, '@token:volumeProfile.boxBackground')
    for (let row = 0; row < config.rows; row++) {
      const inside = row >= profile.lo && row <= profile.hi
      const upColor = inside ? '@token:volumeProfile.valueAreaUp' : '@token:volumeProfile.up'
      const downColor = inside ? '@token:volumeProfile.valueAreaDown' : '@token:volumeProfile.down'
      const up = profile.up[row]!
      const down = profile.down[row]!
      const total = up + down
      const amount = config.mode === 'delta' ? Math.abs(up - down) : total
      const maximum = config.mode === 'delta' ? profile.maxDelta : profile.maximum
      const span = maximum > 0 ? amount / maximum * width : 0
      const start = config.side === 'left' ? left : left + width - span
      const bottom = profile.bottom + row * profile.step
      if (config.mode === 'updown' && total > 0) {
        const split = start + span * up / total
        profileBox(start, split, bottom, bottom + profile.step, upColor)
        profileBox(split, start + span, bottom, bottom + profile.step, downColor)
      } else profileBox(start, start + span, bottom, bottom + profile.step, config.mode === 'delta' && up < down ? downColor : upColor)
    }
    if (config.showPoc) profileLine(first.time, last.end, profile.bottom + (profile.poc + 0.5) * profile.step, '@token:volumeProfile.pointOfControl', config.extendPoc)
    if (config.showVah) profileLine(first.time, last.end, profile.bottom + (profile.hi + 1) * profile.step, '@token:volumeProfile.valueAreaHigh', config.extendVah)
    if (config.showVal) profileLine(first.time, last.end, profile.bottom + profile.lo * profile.step, '@token:volumeProfile.valueAreaLow', config.extendVal)
  }
}

defineLibrary('volumeProfile', { collect: collectProfile, render: renderProfiles })
