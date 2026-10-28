/** MPR：回看窗口内最优的一次买入卖出；差分最大子段和给出价差与买卖两根。 */
/** 文字放在区间框下方，正数向上，因此用负偏移。 */
const TRADE_LABEL_OFFSET = -14

/**
 * 在买入与卖出两根之间画区间框，并在框下方居中标注收益率。
 * @param buyOffset 买入根相对当前根的偏移，数值更大（更早）
 * @param sellOffset 卖出根相对当前根的偏移
 * @param buy 买入价
 * @param sell 卖出价
 * @param fill 区间填充色
 * @param color 边框颜色
 */
function markTrade(
  buyOffset: number,
  sellOffset: number,
  buy: number,
  sell: number,
  fill: string,
  color: string,
): void {
  box.new(
    bar_index + buyOffset,
    sell,
    bar_index + sellOffset,
    buy,
    color,
    0,
    line.style_solid,
    extend.none,
    xloc.bar_index,
    fill,
  )
  // 上升区间的上方是价格本身，文字压到框下沿之外，避免遮挡 K 线。
  label.new({
    x: bar_index + Math.round((buyOffset + sellOffset) / 2),
    y: buy,
    text: '+' + ((sell / buy - 1) * 100).toFixed(1) + '%',
    color: Color.Foreground,
    offsetY: TRADE_LABEL_OFFSET,
  })
}

defineIndicator({
  name: 'MPR',
  title: '最优单次交易',
  info: '回看窗口内一次买入卖出的最大收益率；最大子段和定位买卖两根。',
  position: Position.Main,
  max_boxes_count: 1,
  max_labels_count: 1,
  onBar() {
    const lookback = input.int(120, { title: '回看根数', min: 2, max: 2000 })
    const drawBox = input.bool(true, { title: '标记买卖区间' })
    const color = input.string(Color.Teal, { title: '区间颜色' })
    // 主题色别名后拼两位十六进制 alpha，填充与文字共用同一主题色。
    const fill = color + '26'
    if (!drawBox || !barstate.islast) return
    // 价差序列逐根差分：子段 [start..end] 对应从 start−1 根买入、end 根卖出。
    const runs = ta.maxsum(ta.change(close), lookback)
    const buyOffset = runs[1][0] - 1
    const sellOffset = runs[2][0]
    if (!Number.isFinite(buyOffset) || !Number.isFinite(sellOffset)) return
    const buy = close[-buyOffset]
    const sell = close[-sellOffset]
    // 无盈利区间不标注，避免把零收益画成一次交易。
    if (!(sell > buy)) return
    markTrade(buyOffset, sellOffset, buy, sell, fill, color)
  },
})
