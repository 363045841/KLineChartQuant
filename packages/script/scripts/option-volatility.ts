/**
 * 期权波动与持仓结构（副图）：近月平值 IV、近月 P/C 持仓比。
 *
 * 两个量纲不同（IV 是百分数，P/C 是比值），所以 P/C 按 ×100 画在同一个百分比轴上，
 * 图例写明「×100」，不做隐式换算。数据来源与主图脚本一致：宿主按品种映射取回，
 * 没有映射或取不到数据时画空。脚本之间不共享代码（VM 只有全局），查询逻辑在每个脚本内独立。
 */
/** 只画最近多少天；更早的历史不画，避免副图挤满旧数据。 */
const RECENT_DAYS = 30
/** 一天的毫秒数。 */
const DAY_MS = 86_400_000

/** 本次运行的快照行；数据身份不变时复用，避免逐 bar 复制整份数组。 */
let cachedStamp = -1
let cachedRows: readonly OptionLevelsRow[] = []

/** 取本次运行的快照行；宿主换了标的或来了新快照时刷新缓存。 */
function rows(): readonly OptionLevelsRow[] {
  const latest = option.levels()
  const stamp = latest === null ? -1 : latest.capturedAt
  if (stamp !== cachedStamp) {
    cachedStamp = stamp
    cachedRows = option.history()
  }
  return cachedRows
}

/** 二分查找采集时刻早于 limit 的最近一行；没有更早的行时返回 null。 */
function rowAt(levels: readonly OptionLevelsRow[], limit: number): OptionLevelsRow | null {
  let low = 0
  let high = levels.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    const sample = levels[middle]
    if (sample !== undefined && sample.capturedAt < limit) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found < 0 ? null : (levels[found] ?? null)
}

/** 可画的数值；缺失与非有限值一律留空，不把 NaN 写进数据列。 */
function valueOf(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null
}

defineIndicator({
  name: 'OptionVolatility',
  title: '期权波动与持仓结构（副图）',
  info: '近月平值隐含波动率（ATM IV）与近月 P/C 持仓比。P/C 按 ×100 画在同一百分比轴上，图例已标明。数据由宿主按品种映射取回（BTCUSDT→BTC），没有映射或取不到数据时画空。',
  position: Position.Sub,
  format: Format.Percent,
  onBar() {
    const levels = rows()
    const barTime = time[0]
    // 采集发生在 bar 之内：按 bar 的收盘时刻比较，当前 bar 才取得到本周期内的快照。
    const barEnd = barTime + timeframe.in_seconds() * 1000
    const latest = levels.at(-1) ?? null
    const row =
      latest !== null && barEnd >= latest.capturedAt - RECENT_DAYS * DAY_MS
        ? rowAt(levels, barEnd)
        : null

    const iv = row === null ? null : valueOf(row.atmIvPercent)
    const ratio = row === null ? null : valueOf(row.putCallOiRatio)
    plot.Line(iv, 'atm-iv', { label: 'ATM IV', color: Color.Purple })
    plot.Line(ratio === null ? null : ratio * 100, 'pcr', {
      label: 'P/C 持仓比（×100）',
      color: Color.Teal,
    })
  },
})
