/** 周期成交量分布：统计周期独立于图表周期，算法只在共享脚本库维护。 */
const vp = importLibrary('volumeProfile')

/** 一天的分钟数；阶段单位换算成明细根数上界时使用。 */
const MINUTES_PER_DAY = 1440

/**
 * 一个阶段覆盖的明细根数上界：按单位换算成分钟，K 线取一天封顶。
 *
 * 必须是顶层函数：Request 的选项在声明期求值，不能引用 onBar 的局部变量。
 *
 * @param unit 阶段单位
 * @returns 该阶段最多覆盖的 1 分钟明细根数
 */
function unitMinutesOf(unit: string): number {
  if (unit === 'week') return 7 * MINUTES_PER_DAY
  if (unit === 'month') return 31 * MINUTES_PER_DAY
  return MINUTES_PER_DAY
}

defineIndicator({
  name: 'PVP',
  title: '周期成交量分布',
  position: Position.Main,
  info: '按指定数量的 K 线、天、周或月统计各价格区间的成交量，默认每 1 天一张分布；横条越长，成交量越大。使用低周期 K 线的高低价区间近似分摊成交量，上/下按 K 线涨跌划分，并非逐笔成交或真实买卖量。POC 为成交量最大的价位，VAH/VAL 为价值区上下沿。计算周期控制明细粒度，行数控制价格分档，价值区百分比控制覆盖的成交量比例；宽度、位置和保留期数控制显示，延长线在后续价格首次触及时停止。日界时区留空时按交易所会话切分，填了则按该时区自然日切分（加密永续默认 UTC，日界在北京 08:00）。',
  max_boxes_count: 2000,
  max_lines_count: 2000,
  onBar() {
    const calculationPeriod = input.timeframe(Timeframe.Minute1, { title: '计算周期' })
    const periodCount = input.int(1, { title: '阶段数量', min: 1, max: 12 })
    const periodUnit = input.string('day', {
      title: '阶段单位',
      options: [
        { value: 'candle', label: 'K线' },
        { value: 'day', label: '天' },
        { value: 'week', label: '周' },
        { value: 'month', label: '月' },
      ],
    })
    // 分组日界：留空跟随交易所会话，填了就按该时区的自然日切。
    // 加密永续的会话时区是 UTC，日界落在北京 08:00；填 Asia/Shanghai 可以按本地日分组。
    const dayZone = input.string('', { title: '日界时区（空为交易所时区）' })
    const volumeMode = input.string('updown', {
      title: '成交量',
      options: [
        { value: 'total', label: 'Total' },
        { value: 'updown', label: 'Up/Down' },
        { value: 'delta', label: 'Delta' },
      ],
    })
    const valueAreaPercent = input.float(70, { title: '价值区成交量', min: 1, max: 100 })
    const rowSize = input.int(120, { title: '行数', min: 4, max: 400 })
    const boxWidthPercent = input.float(30, { title: '宽度（阶段百分比）', min: 5, max: 100 })
    const boxPosition = input.string('left', {
      title: '位置',
      options: [
        { value: 'left', label: '左' },
        { value: 'right', label: '右' },
      ],
    })
    const showPoc = input.bool(true, { title: 'POC' })
    const showVah = input.bool(true, { title: 'VAH' })
    const showVal = input.bool(true, { title: 'VAL' })
    const extendPoc = input.bool(false, { title: '向右延长 POC' })
    const extendVah = input.bool(false, { title: '向右延长 VAH' })
    const extendVal = input.bool(false, { title: '向右延长 VAL' })
    const keepPeriods = input.int(8, { title: '保留期数', min: 1, max: 240 })
    const [t, e, o, h, l, c, v, k] = request.security_lower_tf(
      syminfo.tickerid,
      calculationPeriod,
      () =>
        [
          time,
          time_close(),
          open,
          high,
          low,
          close,
          volume,
          dayZone !== ''
            ? time(
                periodUnit === 'day' ? '1D' : periodUnit === 'week' ? '1W' : '1M',
                '0000-2400',
                dayZone,
              )
            : time(periodUnit === 'day' ? '1D' : periodUnit === 'week' ? '1W' : '1M'),
        ] as const,
      // 明细只覆盖最近画得出的阶段，不按图表整段历史拉数万根 1 分钟数据。
      { calcBarsCount: (keepPeriods + 1) * periodCount * unitMinutesOf(periodUnit) },
    )
    vp.collect(t, e, o, h, l, c, v, periodUnit === 'candle' ? k.map(() => bar_index) : k, time[0])
    vp.render(
      {
        rows: rowSize,
        area: valueAreaPercent,
        width: boxWidthPercent,
        side: boxPosition,
        mode: volumeMode,
        showPoc,
        showVah,
        showVal,
        extendPoc,
        extendVah,
        extendVal,
        count: periodCount,
        keep: keepPeriods,
      },
      barstate.islast,
    )
  },
})
