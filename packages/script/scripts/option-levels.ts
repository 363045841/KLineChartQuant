/**
 * 期权关键位（主图）。
 *
 * 只画三条水位：近月 Gamma 翻转、近月 Call 墙、近月 Put 墙。墙位用 **OI×Γ 加权**口径
 * （对冲火力最密集处）；原始 OI 墙在侧栏面板里看，那里两个口径并排。数据由宿主按品种
 * 映射取回（`BTCUSDT` → `BTC`）；与期权源无关的品种没有映射，脚本画空而不是报错，
 * 保证切换品种时指标不会把整张图算失败。
 *
 * 画法上的三个取舍（对照 cloudtradeagent 的期权 overlay 实现）：
 * - **不画 ±σ 区间**。区间不是水位：两条填充带叠在 K 线后面既挡价格，也读不出方向，
 *   关键位才是交易员要盯的东西。
 * - **一律阶梯线**。关键位是「水位」，不是趋势：换代前保持水平，换代处垂直跳一档，
 *   否则斜线会读成价格趋势。
 * - **换代才有一次跳**。采集是分钟级，关键位每分钟都在小幅漂移；按 cloudtradeagent 的口径，
 *   相对变化超过 0.15% 才算换代，否则沿用上一档，阶梯线才不会一分钟抖一次。
 * - **末根写价签**。只靠图例读不出价位；在末根按价格打右对齐文字，「Call 墙 75000」一眼可读。
 *
 * 另外两点容易误读的地方也写进画法：近月 DTE 小于 1 天时在末根标注「今天到期」，
 * 避免把到期前的持仓收缩读成墙位消失；期权线只画最近一段（见 RECENT_DAYS），
 * 长历史让给结构类指标。
 */
/** 只画最近多少天的关键位；更早的历史交给结构与价格类指标。 */
const RECENT_DAYS = 30
/** 一天的毫秒数。 */
const DAY_MS = 86_400_000
/**
 * 换代阈值：相对变化超过 0.15% 才算一次换代。
 *
 * 与 cloudtradeagent 后端 `_merge_generations` 的 `_GEN_TOLERANCE = 0.0015` 同一口径，
 * 目的是把逐分钟的小幅漂移压掉，让阶梯线读起来是「水平位在移动」。
 */
const GENERATION_TOLERANCE = 0.0015

/** 一个关键位的换代点：从 at（毫秒）起取 value。 */
interface Step {
  readonly at: number
  readonly value: number
}

/** 参与画图的序列键；键名同时用作 Plot id。 */
type SeriesKey = 'flip' | 'callWall' | 'putWall'

/** 序列名单；显式列出，避免用类型断言从映射里反查键名。 */
const SERIES_KEYS: readonly SeriesKey[] = ['flip', 'callWall', 'putWall']

/** 各序列从一行快照里读哪个字段；缺失与非有限值一律跳过该行。 */
const SERIES_READERS: Record<SeriesKey, (row: OptionLevelsRow) => number | null> = {
  flip: (row) => row.gammaFlipUsd,
  // 墙位主口径是 OI×Γ 加权；OI 口径的墙在面板里并排显示。
  callWall: (row) => row.callGammaWallUsd,
  putWall: (row) => row.putGammaWallUsd,
}

/** 一次运行的换代缓存；快照身份不变时复用，避免逐 bar 重算。 */
let cachedStamp = -1
let cachedSteps: Record<SeriesKey, Step[]> | null = null

/** 逐分钟快照压成换代序列：首个有效值无条件记录，之后只有超过阈值才算换代。 */
function generations(
  levels: readonly OptionLevelsRow[],
  read: (row: OptionLevelsRow) => number | null,
): Step[] {
  const steps: Step[] = []
  let last: number | null = null
  for (const row of levels) {
    const value = read(row)
    if (value === null || !Number.isFinite(value)) continue
    // last 为 0 时阈值退化为「任何变化都换代」，是除零下的合理退化，不做特判。
    if (last === null || Math.abs(value - last) > GENERATION_TOLERANCE * Math.abs(last)) {
      steps.push({ at: row.capturedAt, value })
      last = value
    }
  }
  return steps
}

/** 取本次运行的换代序列；宿主来了新快照才重算。 */
function series(): Record<SeriesKey, Step[]> {
  const latest = option.levels()
  const stamp = latest === null ? -1 : latest.capturedAt
  if (cachedSteps !== null && stamp === cachedStamp) return cachedSteps
  cachedStamp = stamp
  const levels = option.history()
  const built: Record<SeriesKey, Step[]> = { flip: [], callWall: [], putWall: [] }
  for (const key of SERIES_KEYS) built[key] = generations(levels, SERIES_READERS[key])
  cachedSteps = built
  return built
}

/** 二分查找时刻早于 limit 的最近一代；没有更早的换代时返回 null（该 bar 不画）。 */
function valueAt(steps: readonly Step[], limit: number): number | null {
  let low = 0
  let high = steps.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    const step = steps[middle]
    if (step !== undefined && step.at < limit) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found < 0 ? null : (steps[found]?.value ?? null)
}

/** 可画的价格；缺失与非有限值一律留空，不把 NaN 写进数据列。 */
function price(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null
}

/** 价签数值：整数不带小数，其余保留两位，避免「69000.00」这种噪声。 */
function formatPrice(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

/** 末根标签集合：价签与到期提示共用，每根 bar 先清后建，回滚重算不留残影。 */
let tags: LabelRef[] = []

/** 清掉上一轮标签。 */
function clearTags(): void {
  for (const id of tags) label.delete(id)
  tags = []
}

/** 在价格处写一行右对齐价签；name 与数值拼成整行文字，终点落在末根，不压价格轴。 */
function addTag(value: number | null, name: string, color: Color): void {
  const target = price(value)
  if (target === null) return
  tags.push(
    label.new({
      x: bar_index,
      y: target,
      text: `${name} ${formatPrice(target)}`,
      color,
      size: 11,
      align: 'right',
    }),
  )
}

/** 在末根写一行提示文字，向右上偏移，避免压住同价位的价签。 */
function addNotice(text: string, color: Color): void {
  tags.push(
    label.new({
      x: bar_index,
      y: close[0],
      text,
      color,
      size: 11,
      align: 'right',
      offsetY: 14,
    }),
  )
}

defineIndicator({
  name: 'OptionLevels',
  title: '期权关键位（主图）',
  info: '近月 Gamma 翻转、近月 Call 墙与 Put 墙，墙位按 OI×Γ 加权（对冲火力最密集处）。三条都按阶梯线画：换代前保持水平，换代处跳一档，相对变化超过 0.15% 才算换代。末根写价签，近月剩余天数小于 1 天时标注「今天到期」。不画 ±σ 区间，避免填充带遮挡价格。数据由宿主按品种映射取回（BTCUSDT→BTC），没有映射或取不到数据时画空。',
  position: Position.Main,
  max_labels_count: 8,
  onBar() {
    const barTime = time[0]
    // 采集发生在 bar 之内：按 bar 的收盘时刻取，当前 bar 才拿得到本周期内的换代。
    const barEnd = barTime + timeframe.in_seconds() * 1000
    const latest = option.levels()
    const steps = series()
    // 只画最近一段：更早的 bar 留空，长历史让给结构类指标。
    const inWindow = latest !== null && barEnd >= latest.capturedAt - RECENT_DAYS * DAY_MS
    const at = (key: SeriesKey): number | null => (inWindow ? valueAt(steps[key], barEnd) : null)

    const flip = price(at('flip'))
    const callWall = price(at('callWall'))
    const putWall = price(at('putWall'))

    // 关键位是水位不是趋势，一律阶梯线；颜色沿用 cloudtradeagent 的语义（Call 绿 / Put 红 / 翻转紫）。
    plot.StepLine(flip, 'flip', { label: 'Gamma 翻转', color: Color.Purple, dash: [6, 4] })
    plot.StepLine(callWall, 'call-wall', { label: 'Call 墙', color: Color.Green })
    plot.StepLine(putWall, 'put-wall', { label: 'Put 墙', color: Color.Red })

    // 价签只在末根出现：历史段不重复写文字，避免每根 bar 都堆一列数值。
    clearTags()
    if (!barstate.islast) return
    addTag(callWall, 'Call 墙', Color.Green)
    addTag(putWall, 'Put 墙', Color.Red)
    addTag(flip, 'Gamma 翻转', Color.Purple)
    // 近月 DTE 小于 1 天：到期前持仓天然收缩，必须提示，否则墙位看起来像消失了。
    if (latest !== null && latest.nearTermDteDays < 1) {
      addNotice(
        `期权 ${latest.nearTermExpiryIso} 今天到期（DTE ${latest.nearTermDteDays.toFixed(2)}）`,
        Color.Gray,
      )
    }
  },
})
