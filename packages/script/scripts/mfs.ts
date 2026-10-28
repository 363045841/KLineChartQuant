/** MFS：回看窗口内累计净流入最大的连续区间；上涨根记正量、下跌根记负量。 */
/** 文字放在区间框下方，正数向上，因此用负偏移。 */
const INFLOW_LABEL_OFFSET = -14

/** 成交量紧凑文本：K/M/B 保留一位小数，其余取整。 */
function compactVolume(value: number): string {
  const magnitude = Math.abs(value)
  if (magnitude >= 1e9) return (value / 1e9).toFixed(1) + 'B'
  if (magnitude >= 1e6) return (value / 1e6).toFixed(1) + 'M'
  if (magnitude >= 1e3) return (value / 1e3).toFixed(1) + 'K'
  return value.toFixed(0)
}

/**
 * 画出吸筹区间，并在框下方居中标注净流入量；区间上下界取该段内的最高价与最低价。
 * @param oldest 区间最早一根相对当前根的偏移，数值更大
 * @param newest 区间最新一根相对当前根的偏移
 * @param net 区间累计净流入
 * @param fill 区间填充色
 * @param color 边框颜色
 */
function markInflow(
  oldest: number,
  newest: number,
  net: number,
  fill: string,
  color: string,
): void {
  let top = -Infinity
  let bottom = Infinity
  for (let offset = oldest; offset <= newest; offset++) {
    top = Math.max(top, high[-offset])
    bottom = Math.min(bottom, low[-offset])
  }
  box.new({
    left: bar_index + oldest,
    top,
    right: bar_index + newest,
    bottom,
    borderColor: color,
    borderWidth: 0,
    backgroundColor: fill,
  })
  label.new({
    x: bar_index + Math.round((oldest + newest) / 2),
    y: bottom,
    text: compactVolume(net),
    color: Color.Foreground,
    offsetY: INFLOW_LABEL_OFFSET,
  })
}

defineIndicator({
  name: 'MFS',
  title: '最大净流入段',
  info: '回看窗口内累计净流入最大的连续区间；上涨根计正成交量，下跌根计负成交量。',
  position: Position.Main,
  max_boxes_count: 1,
  max_labels_count: 1,
  onBar() {
    const lookback = input.int(120, { title: '回看根数', min: 2, max: 2000 })
    const drawBox = input.bool(true, { title: '标记区间' })
    const color = input.string(Color.Blue, { title: '区间颜色' })
    // 主题色别名后拼两位十六进制 alpha，填充与文字共用同一主题色。
    const fill = color + '26'
    if (!drawBox || !barstate.islast) return
    // 带符号成交量是逐根量值而非差分，子段下标直接对应 K 线下标。
    const flow = derive('mfs-flow', (_self, offset) => {
      const amount = volume[offset]
      if (!Number.isFinite(amount)) return Number.NaN
      return close[offset] >= open[offset] ? amount : -amount
    })
    const runs = ta.maxsum(flow, lookback)
    const oldest = runs[1][0]
    const newest = runs[2][0]
    const net = runs[0][0]
    if (!Number.isFinite(oldest) || !Number.isFinite(newest) || !(net > 0)) return
    markInflow(oldest, newest, net, fill, color)
  },
})
