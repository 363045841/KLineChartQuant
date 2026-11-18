/**
 * 缠论结构读数（副图）：供 agent 读取的数值版本。
 *
 * 与主图 CHAN 共用同一套严格笔与笔级/段级中枢口径，但只输出数值序列，
 * 便于 agent 读取与回测；主图那份负责画线与矩形。
 */

/** 笔的最小合并柱间隔。 */
const MIN_GAP = 4

/** 一个级别的结构状态。 */
interface ChanLevel {
  merged: { high: number; low: number; direction: number }[]
  fractals: { price: number; kind: string }[]
  strokes: { fromPrice: number; toPrice: number; direction: number }[]
  hubs: { high: number; low: number }[]
  segments: { fromPrice: number; toPrice: number; direction: number }[]
  segHubs: { high: number; low: number }[]
}

/** 第一级状态。 */
const baseLevel: ChanLevel = createLevel()
/** 第二级状态。 */
const midLevel: ChanLevel = createLevel()
/** 第三级状态。 */
const highLevel: ChanLevel = createLevel()

/** 第二级聚合高点。 */
let baseAggHigh = -Infinity
/** 第二级聚合低点。 */
let baseAggLow = Infinity
/** 第二级聚合根数。 */
let baseAggCount = 0
/** 第三级聚合高点。 */
let midAggHigh = -Infinity
/** 第三级聚合低点。 */
let midAggLow = Infinity
/** 第三级聚合根数。 */
let midAggCount = 0

/**
 * 建空级别。
 *
 * @returns 级别状态
 */
function createLevel(): ChanLevel {
  return { merged: [], fractals: [], strokes: [], hubs: [], segments: [], segHubs: [] }
}

/**
 * 喂一根 K 线并推进结构。
 *
 * @param level 级别状态
 * @param currentHigh 当根最高价
 * @param currentLow 当根最低价
 */
function feed(level: ChanLevel, currentHigh: number, currentLow: number): void {
  const merged = level.merged
  const last = merged[merged.length - 1]
  if (last === undefined) {
    merged.push({ high: currentHigh, low: currentLow, direction: 0 })
    return
  }
  const contained = currentHigh <= last.high && currentLow >= last.low
  const contains = currentHigh >= last.high && currentLow <= last.low
  if (!contained && !contains) {
    merged.push({ high: currentHigh, low: currentLow, direction: currentHigh > last.high ? 1 : -1 })
    detectFractal(level)
    return
  }
  const direction = last.direction
  last.high = direction === -1 ? Math.min(last.high, currentHigh) : Math.max(last.high, currentHigh)
  last.low = direction === 1 ? Math.max(last.low, currentLow) : Math.min(last.low, currentLow)
  detectFractal(level)
}

/**
 * 检查最近三根合并柱是否成顶底分型。
 *
 * @param level 级别状态
 */
function detectFractal(level: ChanLevel): void {
  const merged = level.merged
  const size = merged.length
  if (size < 3) return
  const left = merged[size - 3]
  const center = merged[size - 2]
  const right = merged[size - 1]
  const isTop =
    center.high > left.high && center.high > right.high && center.low > left.low && center.low > right.low
  const isBottom =
    center.low < left.low && center.low < right.low && center.high < left.high && center.high < right.high
  if (isTop) acceptFractal(level, center.high, 'top')
  else if (isBottom) acceptFractal(level, center.low, 'bottom')
}

/**
 * 接收分型并成笔。
 *
 * @param level 级别状态
 * @param price 分型价
 * @param kind 类型
 */
function acceptFractal(level: ChanLevel, price: number, kind: string): void {
  const fractals = level.fractals
  const last = fractals[fractals.length - 1]
  if (last === undefined) {
    fractals.push({ price, kind })
    return
  }
  if (last.kind === kind) {
    const better = kind === 'top' ? price > last.price : price < last.price
    if (better) fractals[fractals.length - 1] = { price, kind }
    return
  }
  fractals.push({ price, kind })
  const direction = price > last.price ? 1 : -1
  const valid = (kind === 'top' && direction === 1) || (kind === 'bottom' && direction === -1)
  if (!valid) return
  level.strokes.push({ fromPrice: last.price, toPrice: price, direction })
  updateHub(level)
  updateSegment(level)
}

/**
 * 笔级中枢：连续三笔交集，重叠则延伸。
 *
 * @param level 级别状态
 */
function updateHub(level: ChanLevel): void {
  const strokes = level.strokes
  const size = strokes.length
  if (size < 3) return
  const latest = strokes[size - 1]
  const hub = level.hubs[level.hubs.length - 1]
  if (hub === undefined) {
    const first = strokes[size - 3]
    const second = strokes[size - 2]
    const low = Math.max(
      Math.min(first.fromPrice, first.toPrice),
      Math.min(second.fromPrice, second.toPrice),
      Math.min(latest.fromPrice, latest.toPrice),
    )
    const high = Math.min(
      Math.max(first.fromPrice, first.toPrice),
      Math.max(second.fromPrice, second.toPrice),
      Math.max(latest.fromPrice, latest.toPrice),
    )
    if (low < high) level.hubs.push({ high, low })
    return
  }
  const low = Math.min(latest.fromPrice, latest.toPrice)
  const high = Math.max(latest.fromPrice, latest.toPrice)
  if (low < hub.high && high > hub.low) return
}

/**
 * 段与段级中枢：每三笔合成一段，连续三段交集。
 *
 * @param level 级别状态
 */
function updateSegment(level: ChanLevel): void {
  const strokes = level.strokes
  const size = strokes.length
  if (size < 3 || size % 3 !== 0) return
  const first = strokes[size - 3]
  const third = strokes[size - 1]
  level.segments.push({
    fromPrice: first.fromPrice,
    toPrice: third.toPrice,
    direction: third.toPrice > first.fromPrice ? 1 : -1,
  })
  const segments = level.segments
  const segSize = segments.length
  if (segSize < 3) return
  const latest = segments[segSize - 1]
  const segHub = level.segHubs[level.segHubs.length - 1]
  if (segHub === undefined) {
    const a = segments[segSize - 3]
    const b = segments[segSize - 2]
    const low = Math.max(
      Math.min(a.fromPrice, a.toPrice),
      Math.min(b.fromPrice, b.toPrice),
      Math.min(latest.fromPrice, latest.toPrice),
    )
    const high = Math.min(
      Math.max(a.fromPrice, a.toPrice),
      Math.max(b.fromPrice, b.toPrice),
      Math.max(latest.fromPrice, latest.toPrice),
    )
    if (low < high) level.segHubs.push({ high, low })
  }
}

defineIndicator({
  name: 'CHANSTATS',
  title: '缠论读数（副图）',
  info: '严格笔的三级读数：三级笔方向、三级是否同向、现价相对高级笔中枢与高级段中枢的位置、两组中枢上下沿百分比。与主图 CHAN 同口径，主图负责画线，这里负责给数值。段是每三笔合成的近似线段。',
  position: Position.Sub,
  onBar() {
    const ratio = input.int(4, { title: '级别合成倍数', min: 2, max: 24 })

    feed(baseLevel, high, low)
    baseAggHigh = Math.max(baseAggHigh, high)
    baseAggLow = Math.min(baseAggLow, low)
    baseAggCount += 1
    if (baseAggCount >= ratio) {
      feed(midLevel, baseAggHigh, baseAggLow)
      midAggHigh = Math.max(midAggHigh, baseAggHigh)
      midAggLow = Math.min(midAggLow, baseAggLow)
      midAggCount += 1
      if (midAggCount >= ratio) {
        feed(highLevel, midAggHigh, midAggLow)
        midAggHigh = -Infinity
        midAggLow = Infinity
        midAggCount = 0
      }
      baseAggHigh = -Infinity
      baseAggLow = Infinity
      baseAggCount = 0
    }

    const baseStroke = baseLevel.strokes[baseLevel.strokes.length - 1]
    const midStroke = midLevel.strokes[midLevel.strokes.length - 1]
    const highStroke = highLevel.strokes[highLevel.strokes.length - 1]
    const highHub = highLevel.hubs[highLevel.hubs.length - 1]
    const highSeg = highLevel.segments[highLevel.segments.length - 1]
    const highSegHub = highLevel.segHubs[highLevel.segHubs.length - 1]

    plot.Line(baseStroke === undefined ? null : baseStroke.direction, 'biDir', {
      label: '本级别笔',
      color: Color.Teal,
    })
    plot.Line(midStroke === undefined ? null : midStroke.direction, 'biDirMid', {
      label: '中级别笔',
      color: Color.Orange,
    })
    plot.Line(highStroke === undefined ? null : highStroke.direction, 'biDirHigh', {
      label: '高级别笔',
      color: Color.Purple,
    })
    plot.Line(highSeg === undefined ? null : highSeg.direction, 'segDirHigh', {
      label: '高级别段',
      color: Color.Yellow,
    })
    plot.Line(
      highHub === undefined ? null : close > highHub.high ? 1 : close < highHub.low ? -1 : 0,
      'biHubPos',
      { label: '笔中枢位置', color: Color.Blue },
    )
    plot.Line(
      highSegHub === undefined ? null : close > highSegHub.high ? 1 : close < highSegHub.low ? -1 : 0,
      'segHubPos',
      { label: '段中枢位置', color: Color.Indigo },
    )
    plot.Line(highHub === undefined ? null : ((highHub.high - close) / close) * 100, 'biHubHighPct', {
      label: '笔中枢上沿%',
      color: Color.Red,
    })
    plot.Line(highHub === undefined ? null : ((highHub.low - close) / close) * 100, 'biHubLowPct', {
      label: '笔中枢下沿%',
      color: Color.Green,
    })
    plot.Line(highSegHub === undefined ? null : ((highSegHub.high - close) / close) * 100, 'segHubHighPct', {
      label: '段中枢上沿%',
      color: Color.Red + 'CC',
    })
    plot.Line(highSegHub === undefined ? null : ((highSegHub.low - close) / close) * 100, 'segHubLowPct', {
      label: '段中枢下沿%',
      color: Color.Green + 'CC',
    })
  },
})
