/** 周期成交量分布：统计周期独立于图表周期，算法只在共享脚本库维护。 */
const vp = importLibrary('volumeProfile')
defineIndicator({
  name: 'PVP', title: '周期成交量分布', position: Position.Main,
  info: '按指定数量的 K 线、天、周或月统计各价格区间的成交量，默认每 1 天一张分布；横条越长，成交量越大。使用低周期 K 线的高低价区间近似分摊成交量，上/下按 K 线涨跌划分，并非逐笔成交或真实买卖量。POC 为成交量最大的价位，VAH/VAL 为价值区上下沿。计算周期控制明细粒度，行数控制价格分档，价值区百分比控制覆盖的成交量比例；宽度、位置和保留期数控制显示，延长线在后续价格首次触及时停止。',
  max_boxes_count: 2000, max_lines_count: 2000,
  onBar() {
    const calculationPeriod = input.timeframe(Timeframe.Minute1, { title: '计算周期' })
    const periodCount = input.int(1, { title: '阶段数量', min: 1, max: 12 })
    const periodUnit = input.string('day', { title: '阶段单位', options: [{ value: 'candle', label: 'K线' }, { value: 'day', label: '天' }, { value: 'week', label: '周' }, { value: 'month', label: '月' }] })
    const volumeMode = input.string('updown', { title: '成交量', options: [{ value: 'total', label: 'Total' }, { value: 'updown', label: 'Up/Down' }, { value: 'delta', label: 'Delta' }] })
    const valueAreaPercent = input.float(70, { title: '价值区成交量', min: 1, max: 100 })
    const rowSize = input.int(120, { title: '行数', min: 4, max: 400 })
    const boxWidthPercent = input.float(30, { title: '宽度（阶段百分比）', min: 5, max: 100 })
    const boxPosition = input.string('left', { title: '位置', options: [{ value: 'left', label: '左' }, { value: 'right', label: '右' }] })
    const showPoc = input.bool(true, { title: 'POC' })
    const showVah = input.bool(true, { title: 'VAH' })
    const showVal = input.bool(true, { title: 'VAL' })
    const extendPoc = input.bool(false, { title: '向右延长 POC' })
    const extendVah = input.bool(false, { title: '向右延长 VAH' })
    const extendVal = input.bool(false, { title: '向右延长 VAL' })
    const keepPeriods = input.int(8, { title: '保留期数', min: 1, max: 240 })
    const [t, e, o, h, l, c, v, k] = request.security_lower_tf(syminfo.tickerid, calculationPeriod, () => [time, time_close(), open, high, low, close, volume, time(params.periodUnit === 'day' ? '1D' : params.periodUnit === 'week' ? '1W' : '1M')] as const)
    vp.collect(t, e, o, h, l, c, v, periodUnit === 'candle' ? k.map(() => bar_index) : k)
    if (barstate.islast) vp.render({ rows: rowSize, area: valueAreaPercent, width: boxWidthPercent, side: boxPosition, mode: volumeMode, showPoc, showVah, showVal, extendPoc, extendVah, extendVal, count: periodCount, keep: keepPeriods })
  },
})
