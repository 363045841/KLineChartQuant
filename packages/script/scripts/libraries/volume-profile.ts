/** SVP/PVP共享脚本库：分段、成交量分箱、价值区及公共box/line输出；宿主不包含指标算法。 */
type ProfileBar = {
  time: number
  end: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  key: number
}
type ProfileConfig = {
  rows: number
  area: number
  width: number
  side: string
  mode: string
  showPoc: boolean
  showVah: boolean
  showVal: boolean
  extendPoc: boolean
  extendVah: boolean
  extendVal: boolean
  count: number
  keep: number
}

/** 逐bar收集的输入只保留数据；库状态参与会话检查点，同 bar 重算可恢复。 */
let profileBars: ProfileBar[] = []
/** 自然期分组；collectProfile 增量维护，render 不再每根 bar 重建。 */
let stageGroups: ProfileBar[][] = []

/** 从明细数组重建自然期分组；仅在同 bar 撤销或裁剪后使用。 */
function buildGroups(bars: readonly ProfileBar[]): ProfileBar[][] {
  const groups: ProfileBar[][] = []
  for (const bar of bars) {
    let group = groups[groups.length - 1]
    if (!group || group[0]!.key !== bar.key) {
      group = []
      groups.push(group)
    }
    group.push(bar)
  }
  return groups
}

/** 追加已按主图bar分组的低周期明细；cutoff 为当前主图 bar 起点，同 bar 重算先撤销旧明细。 */
function collectProfile(
  times: readonly number[],
  ends: readonly number[],
  opens: readonly number[],
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  volumes: readonly number[],
  keys: readonly number[],
  cutoff: number,
): void {
  if (Number.isFinite(cutoff)) {
    let keep = profileBars.length
    while (keep > 0 && profileBars[keep - 1]!.time >= cutoff) keep--
    if (keep !== profileBars.length) {
      profileBars.length = keep
      stageGroups = buildGroups(profileBars)
    }
  }
  for (let i = 0; i < times.length; i++) {
    if (!Number.isFinite(keys[i])) continue
    const bar: ProfileBar = {
      time: times[i]!,
      end: ends[i]!,
      open: opens[i]!,
      high: highs[i]!,
      low: lows[i]!,
      close: closes[i]!,
      volume: volumes[i]!,
      key: keys[i]!,
    }
    profileBars.push(bar)
    const group = stageGroups[stageGroups.length - 1]
    if (!group || group[0]!.key !== bar.key) stageGroups.push([bar])
    else group.push(bar)
  }
}

/** 一段的聚合结果；单价成交落入最高桶时也要保留总量。 */
function buildProfile(bars: readonly ProfileBar[], rows: number, area: number) {
  let bottom = Infinity
  let top = -Infinity
  for (const bar of bars) {
    bottom = Math.min(bottom, bar.low)
    top = Math.max(top, bar.high)
  }
  if (!(top > bottom)) return undefined
  const step = (top - bottom) / rows
  const up = new Array<number>(rows).fill(0)
  const down = new Array<number>(rows).fill(0)
  for (const bar of bars) {
    if (!Number.isFinite(bar.volume) || bar.volume <= 0) continue
    const output = bar.close >= bar.open ? up : down
    const span = bar.high - bar.low
    if (span <= 0) {
      output[Math.min(rows - 1, Math.max(0, Math.floor((bar.close - bottom) / step)))]! +=
        bar.volume
      continue
    }
    const first = Math.max(0, Math.floor((bar.low - bottom) / step))
    const last = Math.min(rows - 1, Math.floor((bar.high - bottom) / step))
    for (let row = first; row <= last; row++) {
      const overlap = Math.max(
        0,
        Math.min(bar.high, bottom + (row + 1) * step) - Math.max(bar.low, bottom + row * step),
      )
      output[row]! += (bar.volume * overlap) / span
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
  while (covered < (total * area) / 100 && (lo > 0 || hi < rows - 1)) {
    const upper = (totals[hi + 1] ?? 0) + (totals[hi + 2] ?? 0)
    const lower = (totals[lo - 1] ?? 0) + (totals[lo - 2] ?? 0)
    // 空桶不代表分布结束；跨过它们才能达到目标覆盖率。
    const upward = lo === 0 || (hi < rows - 1 && upper >= lower)
    const boundary = upward ? Math.min(rows - 1, hi + 2) : Math.max(0, lo - 2)
    if (upward) {
      for (let i = hi + 1; i <= boundary; i++) covered += totals[i]!
      hi = boundary
    } else {
      for (let i = lo - 1; i >= boundary; i--) covered += totals[i]!
      lo = boundary
    }
  }
  return {
    bottom,
    top,
    step,
    up,
    down,
    totals,
    poc,
    lo,
    hi,
    maximum: Math.max(...totals),
    maxDelta: Math.max(...up.map((value, i) => Math.abs(value - down[i]!))),
  }
}

/** 绘图引用只保留稳定 id，阶段裁剪时用于精确删除。 */
type ProfileRef = { readonly id: string }

/** 用时间坐标输出无边框横条；小数宽度只在最后转换成整数毫秒。 */
function profileBox(
  left: number,
  right: number,
  bottom: number,
  top: number,
  color: string,
): ProfileRef | undefined {
  if (!(right > left)) return undefined
  return box.new({
    left: Math.round(left),
    right: Math.round(right),
    top,
    bottom,
    xloc: xloc.bar_time,
    borderWidth: 0,
    borderColor: color,
    backgroundColor: color,
  })
}

/** 参考线引用只保留稳定 id，更新终点时继续复用同一绘图对象。 */
type ProfileLineRef = { readonly id: string }
/** 参考线投影结果；extending 表示尚未被后续价格触及，仍使用右侧延伸语义。 */
type ProfileLineResult = {
  readonly ref: ProfileLineRef
  readonly end: number
  readonly extending: boolean
}
/** 已完成阶段的参考线；只更新触价后的终点，不重建整期。 */
type StageLine = {
  readonly key: string
  readonly ref: ProfileLineRef
  readonly price: number
  end: number
  extending: boolean
}
/** 已完成阶段的全部绘图引用；保留期裁剪时精确删除，不依赖全局上限。 */
type StageDrawings = { readonly boxes: readonly ProfileRef[]; readonly lines: readonly StageLine[] }

/** 已完成阶段；活动阶段不进入此集合，每轮重算。 */
const renderedStages = new Set<string>()
/** 已完成阶段的绘图引用，按阶段 key 复用与回收。 */
const stageDrawings = new Map<string, StageDrawings>()

/** 参考线延伸到后续第一根覆盖价格的明细；未触及时使用公共right延长语义。 */
function profileLine(
  start: number,
  end: number,
  price: number,
  color: string,
  extended: boolean,
): ProfileLineResult {
  let touched = false
  if (extended) {
    for (const bar of profileBars) {
      if (!bar || bar.time < end || price < bar.low || price > bar.high) continue
      end = bar.end
      touched = true
      break
    }
  }
  const extending = extended && !touched
  return {
    ref: line.new({
      x1: start,
      x2: end,
      y1: price,
      y2: price,
      xloc: xloc.bar_time,
      color,
      extend: extending ? extend.right : extend.none,
    }),
    end,
    extending,
  }
}

/** 已完成阶段的参考线只在后续价格触及时推进终点，未触及时保持延伸。 */
function updateStageLine(stage: StageLine): void {
  if (!stage.extending) return
  for (const bar of profileBars) {
    if (!bar || bar.time < stage.end || stage.price < bar.low || stage.price > bar.high) continue
    stage.end = bar.end
    stage.extending = false
    line.set_x2(stage.ref, bar.end)
    line.set_extend(stage.ref, extend.none)
    return
  }
}

/** 合并相邻自然期；count 为 1 时直接复用现有分组，不复制数组。 */
function mergeStageGroups(groups: readonly ProfileBar[][], count: number): ProfileBar[][] {
  const merged: ProfileBar[][] = []
  for (let i = 0; i < groups.length; i += count) merged.push(groups.slice(i, i + count).flat())
  return merged
}

/** 按原生周期边界分组并合并N期；完成期冻结，活动期只在末根重算。 */
function renderProfiles(config: ProfileConfig, isLast: boolean): void {
  // 历史阶段不输出；只在末根渲染保留期内的完成期与活动期，避免全历史建图。
  if (!isLast) return
  const groups = config.count === 1 ? stageGroups : mergeStageGroups(stageGroups, config.count)
  const keep = Math.max(1, Math.min(config.keep, Math.floor(2000 / (config.rows * 2 + 1))))
  if (isLast && groups.length > keep) console.info(`成交量分布保留最近${keep}期（绘图对象预算）`)
  if (!profileBars.length) throw new Error('没有可用的低周期成交量明细，请检查行情源及计算周期')
  const kept = groups.slice(-keep)
  const keptKeys = new Set(kept.map((group) => String(group[0]!.key)))
  for (const key of renderedStages) if (!keptKeys.has(key)) renderedStages.delete(key)
  for (const [key, drawings] of stageDrawings) {
    if (keptKeys.has(key)) continue
    for (const ref of drawings.boxes) box.delete(ref)
    for (const stageLine of drawings.lines) line.delete(stageLine.ref)
    stageDrawings.delete(key)
  }
  // 只保留当前保留期内的明细，历史分布不再随保留期增长。
  const firstKeptTime = kept[0]?.[0]?.time
  if (firstKeptTime !== undefined) {
    let drop = 0
    while (drop < profileBars.length && profileBars[drop]!.time < firstKeptTime) drop++
    if (drop > 0) {
      profileBars = profileBars.slice(drop)
      stageGroups = buildGroups(profileBars)
    }
  }
  for (let index = 0; index < kept.length; index++) {
    const group = kept[index]!
    const first = group[0]
    if (!first) continue
    const key = String(first.key)
    const active = index === kept.length - 1
    // 完成期已输出后冻结；活动期在提交检查点之后单独渲染。
    if (active) __commitCheckpoint()
    if (!active && renderedStages.has(key)) {
      const drawings = stageDrawings.get(key)
      if (drawings) for (const stageLine of drawings.lines) updateStageLine(stageLine)
      continue
    }
    const boxes: ProfileRef[] = []
    const lines: StageLine[] = []
    const profile = buildProfile(group, config.rows, config.area)
    if (!profile) continue
    const last = group[group.length - 1]!
    const width = ((last.end - first.time) * config.width) / 100
    const left = config.side === 'left' ? first.time : last.end - width
    const background = profileBox(
      left,
      left + width,
      profile.bottom,
      profile.top,
      '@token:volumeProfile.boxBackground',
    )
    if (background) boxes.push(background)
    for (let row = 0; row < config.rows; row++) {
      const inside = row >= profile.lo && row <= profile.hi
      const upColor = inside ? '@token:volumeProfile.valueAreaUp' : '@token:volumeProfile.up'
      const downColor = inside ? '@token:volumeProfile.valueAreaDown' : '@token:volumeProfile.down'
      const up = profile.up[row]!
      const down = profile.down[row]!
      const total = up + down
      const amount = config.mode === 'delta' ? Math.abs(up - down) : total
      const maximum = config.mode === 'delta' ? profile.maxDelta : profile.maximum
      const span = maximum > 0 ? (amount / maximum) * width : 0
      const start = config.side === 'left' ? left : left + width - span
      const bottom = profile.bottom + row * profile.step
      if (config.mode === 'updown' && total > 0) {
        const split = start + (span * up) / total
        const upBox = profileBox(start, split, bottom, bottom + profile.step, upColor)
        const downBox = profileBox(split, start + span, bottom, bottom + profile.step, downColor)
        if (upBox) boxes.push(upBox)
        if (downBox) boxes.push(downBox)
      } else {
        const bar = profileBox(
          start,
          start + span,
          bottom,
          bottom + profile.step,
          config.mode === 'delta' && up < down ? downColor : upColor,
        )
        if (bar) boxes.push(bar)
      }
    }
    if (config.showPoc) {
      const result = profileLine(
        first.time,
        last.end,
        profile.bottom + (profile.poc + 0.5) * profile.step,
        '@token:volumeProfile.pointOfControl',
        config.extendPoc,
      )
      if (!active)
        lines.push({
          key,
          ref: result.ref,
          price: profile.bottom + (profile.poc + 0.5) * profile.step,
          end: result.end,
          extending: result.extending,
        })
    }
    if (config.showVah) {
      const result = profileLine(
        first.time,
        last.end,
        profile.bottom + (profile.hi + 1) * profile.step,
        '@token:volumeProfile.valueAreaHigh',
        config.extendVah,
      )
      if (!active)
        lines.push({
          key,
          ref: result.ref,
          price: profile.bottom + (profile.hi + 1) * profile.step,
          end: result.end,
          extending: result.extending,
        })
    }
    if (config.showVal) {
      const result = profileLine(
        first.time,
        last.end,
        profile.bottom + profile.lo * profile.step,
        '@token:volumeProfile.valueAreaLow',
        config.extendVal,
      )
      if (!active)
        lines.push({
          key,
          ref: result.ref,
          price: profile.bottom + profile.lo * profile.step,
          end: result.end,
          extending: result.extending,
        })
    }
    if (!active) {
      stageDrawings.set(key, { boxes, lines })
      renderedStages.add(key)
    }
  }
}

/** 库状态检查点：明细数组、已完成阶段与绘图引用；只复制引用，不复制明细对象。 */
type ProfileState = {
  bars: ProfileBar[]
  readonly stages: readonly string[]
  readonly drawings: readonly (readonly [string, StageDrawings])[]
}

/** 运行时检查点恢复的是库自己的可变状态，不依赖绘图对象重建。 */
function isProfileState(value: unknown): value is ProfileState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'bars' in value &&
    'stages' in value &&
    'drawings' in value
  )
}

const profileState = {
  checkpoint(): ProfileState {
    return {
      bars: profileBars.slice(),
      stages: [...renderedStages],
      drawings: [...stageDrawings.entries()].map(([key, drawings]) => [
        key,
        { boxes: drawings.boxes.slice(), lines: drawings.lines.map((line) => ({ ...line })) },
      ]),
    }
  },
  rollback(value: unknown): void {
    if (!isProfileState(value)) throw new TypeError('成交量分布检查点格式错误')
    profileBars = value.bars
    stageGroups = buildGroups(profileBars)
    renderedStages.clear()
    for (const key of value.stages) renderedStages.add(key)
    stageDrawings.clear()
    for (const [key, drawings] of value.drawings) stageDrawings.set(key, drawings)
  },
}

defineLibrary('volumeProfile', { collect: collectProfile, render: renderProfiles }, profileState)
