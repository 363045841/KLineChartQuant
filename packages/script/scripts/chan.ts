/**
 * 缠论结构（主图）：严格笔 + 笔级中枢 + 段级中枢。
 *
 * 主图画图形必须走绘图 API：line 画笔与段，box 画中枢并把中文标识写进 box 的 text。
 * 字段名按 KCQ 契约的 camelCase（borderColor / backgroundColor / text 等），
 * 与已发布脚本 zones.ts 的用法一致。
 *
 * 中枢必须能结束并再成立：一个中枢离开区间后要结束，下一组三笔交集成立时新建下一个，
 * 存续期间用 box.set_right 延伸右边界。只创建不结束会让全图只剩「中枢一」。
 * 绘图对象受 max_lines_count / max_boxes_count 限制，超出后 API 淘汰最早的对象，
 * 所以两个额度按最长可见历史给足；额度过小时历史区的笔与中枢会被淘汰掉。
 */

/** 一个级别的结构状态。 */
interface ChanLevel {
  merged: { high: number; low: number; direction: number }[]
  fractals: { price: number; kind: string; bar: number }[]
  strokes: { fromPrice: number; toPrice: number; fromBar: number; toBar: number; direction: number }[]
  hubs: { high: number; low: number }[]
  segments: { fromPrice: number; toPrice: number; fromBar: number; toBar: number; direction: number }[]
  segHubs: { high: number; low: number }[]
}

/** 高级别状态（主图只画这一级，避免多级线条重叠）。 */
const level: ChanLevel = { merged: [], fractals: [], strokes: [], hubs: [], segments: [], segHubs: [] }

/** 第一级聚合高点。 */
let agg1High = -Infinity
/** 第一级聚合低点。 */
let agg1Low = Infinity
/** 第一级聚合根数。 */
let agg1Count = 0
/** 第二级聚合高点。 */
let agg2High = -Infinity
/** 第二级聚合低点。 */
let agg2Low = Infinity
/** 第二级聚合根数。 */
let agg2Count = 0
/** 笔级中枢序号。 */
let hubCount = 0
/** 段级中枢序号。 */
let segHubCount = 0

/** 一个已经画出矩形、尚未结束的中枢。 */
interface HubState {
  high: number
  low: number
  box: BoxRef
}

/** 未结束的笔级中枢。 */
let activeHub: HubState | null = null
/** 未结束的段级中枢。 */
let activeSegHub: HubState | null = null

/**
 * 数字转中文序号，覆盖 1..99；超出范围直接给数字。
 *
 * @param value 序号
 * @returns 中文序号
 */
function toChinese(value: number): string {
  const digits: readonly string[] = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (!Number.isInteger(value) || value < 1 || value > 99) return String(value)
  if (value < 10) return digits[value] ?? String(value)
  const tens = Math.floor(value / 10)
  // 十位为 1 时按口语读作「十」，不写「一十」。
  const tensText = tens === 1 ? '十' : `${digits[tens] ?? ''}十`
  const ones = value % 10
  return ones === 0 ? tensText : `${tensText}${digits[ones] ?? ''}`
}

/**
 * 喂一根合成 K 线并推进结构。
 *
 * @param currentHigh 当根最高价
 * @param currentLow 当根最低价
 * @param bar 当前图表 bar 索引
 * @param period 周期标签
 */
function feed(currentHigh: number, currentLow: number, bar: number, period: string): void {
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
    detectFractal(bar, period)
    return
  }
  const direction = last.direction
  last.high = direction === -1 ? Math.min(last.high, currentHigh) : Math.max(last.high, currentHigh)
  last.low = direction === 1 ? Math.max(last.low, currentLow) : Math.min(last.low, currentLow)
  detectFractal(bar, period)
}

/**
 * 检查最近三根合并柱是否成顶底分型。
 *
 * @param bar 当前 bar
 * @param period 周期标签
 */
function detectFractal(bar: number, period: string): void {
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
  if (isTop) acceptFractal(center.high, 'top', bar, period)
  else if (isBottom) acceptFractal(center.low, 'bottom', bar, period)
}

/**
 * 接收分型；同类型取更极端，异类型间隔够则成笔并画线。
 *
 * @param price 分型价
 * @param kind 类型
 * @param bar 当前 bar
 * @param period 周期标签
 */
function acceptFractal(price: number, kind: string, bar: number, period: string): void {
  const fractals = level.fractals
  const last = fractals[fractals.length - 1]
  if (last === undefined) {
    fractals.push({ price, kind, bar })
    return
  }
  if (last.kind === kind) {
    const better = kind === 'top' ? price > last.price : price < last.price
    if (better) fractals[fractals.length - 1] = { price, kind, bar }
    return
  }
  fractals.push({ price, kind, bar })
  const direction = price > last.price ? 1 : -1
  const valid = (kind === 'top' && direction === 1) || (kind === 'bottom' && direction === -1)
  if (!valid) return

  const stroke = { fromPrice: last.price, toPrice: price, fromBar: last.bar, toBar: bar, direction }
  level.strokes.push(stroke)
  line.new({
    x1: stroke.fromBar,
    y1: stroke.fromPrice,
    x2: stroke.toBar,
    y2: stroke.toPrice,
    color: direction === 1 ? Color.Teal : Color.Red,
    width: 2,
  })
  updateHub(bar, period)
  updateSegment(bar, period)
}

/**
 * 延伸一个未结束的中枢：新区间与中枢区间重叠就拉长右边界，离开区间就结束。
 *
 * @param hub 当前未结束的中枢
 * @param low 新区间下沿
 * @param high 新区间上沿
 * @param bar 当前图表 bar
 * @returns 仍然有效的中枢；返回 null 表示该中枢已结束
 */
function extendHub(hub: HubState | null, low: number, high: number, bar: number): HubState | null {
  if (hub === null) return null
  if (low < hub.high && high > hub.low) {
    box.set_right(hub.box, bar)
    return hub
  }
  return null
}

/**
 * 画出一个新中枢，返回它的存续状态。
 *
 * @param bar 当前图表 bar
 * @param low 中枢下沿
 * @param high 中枢上沿
 * @param left 中枢起点 bar
 * @param text 中枢文字标识
 * @param fill 矩形底色
 * @param border 边框与文字基色
 * @returns 新中枢状态
 */
function createHub(
  bar: number,
  low: number,
  high: number,
  left: number,
  text: string,
  fill: string,
  border: string,
): HubState {
  const boxRef = box.new({
    left,
    top: high,
    right: bar,
    bottom: low,
    backgroundColor: fill,
    borderColor: border,
    borderWidth: 1,
    text,
    textColor: Color.Foreground,
  })
  return { high, low, box: boxRef }
}

/**
 * 笔级中枢：连续三笔交集成立新中枢，存续期间随最新一笔延伸。
 *
 * @param bar 当前 bar
 * @param period 周期标签
 */
function updateHub(bar: number, period: string): void {
  const strokes = level.strokes
  const size = strokes.length
  if (size === 0) return
  const latest = strokes[size - 1]
  const latestLow = Math.min(latest.fromPrice, latest.toPrice)
  const latestHigh = Math.max(latest.fromPrice, latest.toPrice)

  // 先判断旧中枢是否还覆盖最新一笔；离开区间时右边界停在最后一根覆盖的 bar。
  activeHub = extendHub(activeHub, latestLow, latestHigh, bar)
  if (activeHub !== null || size < 3) return

  const first = strokes[size - 3]
  const second = strokes[size - 2]
  const low = Math.max(
    Math.min(first.fromPrice, first.toPrice),
    Math.min(second.fromPrice, second.toPrice),
    latestLow,
  )
  const high = Math.min(
    Math.max(first.fromPrice, first.toPrice),
    Math.max(second.fromPrice, second.toPrice),
    latestHigh,
  )
  if (low >= high) return
  level.hubs.push({ high, low })
  hubCount += 1
  activeHub = createHub(
    bar,
    low,
    high,
    first.fromBar,
    `中枢${toChinese(hubCount)}（${period}）`,
    Color.Blue + '1A',
    Color.Blue,
  )
}

/**
 * 段与段级中枢：每三笔合成一段画粗线，连续三段交集画矩形。
 *
 * @param bar 当前 bar
 * @param period 周期标签
 */
function updateSegment(bar: number, period: string): void {
  const strokes = level.strokes
  const size = strokes.length
  if (size < 3 || size % 3 !== 0) return
  const first = strokes[size - 3]
  const third = strokes[size - 1]
  const segment = {
    fromPrice: first.fromPrice,
    toPrice: third.toPrice,
    fromBar: first.fromBar,
    toBar: third.toBar,
    direction: third.toPrice > first.fromPrice ? 1 : -1,
  }
  level.segments.push(segment)
  line.new({
    x1: segment.fromBar,
    y1: segment.fromPrice,
    x2: segment.toBar,
    y2: segment.toPrice,
    color: Color.Yellow,
    width: 4,
  })

  const segments = level.segments
  const segSize = segments.length
  if (segSize < 3) return
  const latest = segments[segSize - 1]
  const latestLow = Math.min(latest.fromPrice, latest.toPrice)
  const latestHigh = Math.max(latest.fromPrice, latest.toPrice)

  // 段级中枢与笔级中枢同一套存续规则：延伸，离开即结束，之后再成立下一个。
  activeSegHub = extendHub(activeSegHub, latestLow, latestHigh, bar)
  if (activeSegHub !== null) return

  const a = segments[segSize - 3]
  const b = segments[segSize - 2]
  const low = Math.max(
    Math.min(a.fromPrice, a.toPrice),
    Math.min(b.fromPrice, b.toPrice),
    latestLow,
  )
  const high = Math.min(
    Math.max(a.fromPrice, a.toPrice),
    Math.max(b.fromPrice, b.toPrice),
    latestHigh,
  )
  if (low >= high) return
  level.segHubs.push({ high, low })
  segHubCount += 1
  activeSegHub = createHub(
    bar,
    low,
    high,
    a.fromBar,
    `段中枢${toChinese(segHubCount)}（${period}）`,
    Color.Purple + '14',
    Color.Purple,
  )
}

defineIndicator({
  name: 'CHAN',
  title: '缠论结构（主图）',
  info: '严格笔 + 笔级中枢 + 段级中枢，画在主图。笔为细线、段为粗线，中枢为矩形并标中文「中枢一（周期）」，存续期间随行情向右延伸。段是每三笔合成的近似线段，不是特征序列线段。绘图额度按长历史给足，超出后最早的结构会被淘汰。只描述结构事实，不含买卖判断。',
  position: Position.Main,
  // 笔与段共用 line 额度、两级中枢共用 box 额度；默认各 50 会在长历史里淘汰旧结构。
  max_lines_count: 1000,
  max_boxes_count: 200,
  onBar() {
    const ratio = input.int(3, { title: '级别合成倍数', min: 2, max: 24 })
    const period = input.string('周', { title: '高级别标签' })

    agg1High = Math.max(agg1High, high)
    agg1Low = Math.min(agg1Low, low)
    agg1Count += 1
    if (agg1Count < ratio) return

    agg2High = Math.max(agg2High, agg1High)
    agg2Low = Math.min(agg2Low, agg1Low)
    agg2Count += 1
    if (agg2Count < ratio) {
      agg1High = -Infinity
      agg1Low = Infinity
      agg1Count = 0
      return
    }

    feed(agg2High, agg2Low, bar_index, period)

    // 数值读数：图例里给出最近一笔的端点价，图元本身仍由 line / box 绘制。
    const lastStroke = level.strokes[level.strokes.length - 1]
    plot.Line(lastStroke === undefined ? null : lastStroke.toPrice, 'biEndPrice', {
      label: '最近笔端点',
      color: Color.Teal,
      lineStyle: LineStyle.Dashed,
    })

    agg1High = -Infinity
    agg1Low = Infinity
    agg1Count = 0
    agg2High = -Infinity
    agg2Low = Infinity
    agg2Count = 0
  },
})
