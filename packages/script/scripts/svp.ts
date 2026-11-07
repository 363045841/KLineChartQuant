/** 交易时段成交量分布：低周期明细在自身市场时区分组，通过公共box/line输出。 */
const vp = importLibrary('volumeProfile')
defineIndicator({
  name: 'SVP',
  title: '交易时段成交量分布',
  position: Position.Main,
  info: '按交易日统计各价格区间的成交量，可选择完整交易日、常规盘或自定义时段；横条越长，成交量越大。使用低周期 K 线的高低价区间近似分摊成交量，上/下按 K 线涨跌划分，并非逐笔成交或真实买卖量。POC 为成交量最大的价位，VAH/VAL 为价值区上下沿。计算周期控制明细粒度，行数控制价格分档，价值区百分比控制覆盖的成交量比例；自定义时区留空时使用交易所时区。宽度、位置和保留期数控制显示，延长线在后续价格首次触及时停止。',
  max_boxes_count: 2000,
  max_lines_count: 2000,
  onBar() {
    const calculationPeriod = input.timeframe(Timeframe.Minute1, { title: '计算周期' })
    const sessionMode = input.string('all', {
      title: '交易时段',
      options: [
        { value: 'all', label: '完整交易日' },
        { value: 'regular', label: '常规盘' },
        { value: 'custom', label: '自定义' },
      ],
    })
    const sessionHours = input.session('0930-1600', { title: '自定义时段' })
    const sessionTimezone = input.string('', { title: '自定义时区（空为交易所时区）' })
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
          sessionMode === 'custom'
            ? time('1D', sessionHours, sessionTimezone || undefined)
            : sessionMode === 'regular' && !session.ismarket
              ? Number.NaN
              : time_tradingday,
        ] as const,
    )
    vp.collect(t, e, o, h, l, c, v, k, time[0])
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
        count: 1,
        keep: keepPeriods,
      },
      barstate.islast,
    )
  },
})
