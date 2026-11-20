/** Pine风格时间门面；计算委派宿主共享实现，QuickJS与原生后端保持一致。 */
const timeframe = Object.freeze({
  get period() {
    return __requestContext.time?.period ?? ''
  },
  inSeconds(period = timeframe.period): number {
    return __timeframeSeconds(period)
  },
  change(period: string): boolean {
    return (
      __count() > 0 &&
      (__count() === 1 ||
        __timeValue('open', period, time[0]) !== __timeValue('open', period, time[1]))
    )
  },
})

/** 指定周期的开盘时间；自定义时段外返回 NaN。 */
function timeOpen(period = timeframe.period, session?: string, timezone?: string): number {
  return __timeValue('open', period, time[0], session, timezone)
}

/** 指定周期的收盘时间；自定义时段外返回 NaN。 */
function timeClose(period = timeframe.period, session?: string, timezone?: string): number {
  return __timeValue('close', period, time[0], session, timezone)
}

const session = Object.freeze({
  get isMarket() {
    return __timeValue('market', '', time[0]) === 1
  },
  get isPremarket() {
    return __timeValue('premarket', '', time[0]) === 1
  },
  get isPostmarket() {
    return __timeValue('postmarket', '', time[0]) === 1
  },
  get isFirstBar() {
    return timeframe.change('1D')
  },
  get isFirstBarRegular() {
    if (!session.isMarket) return false
    return __count() === 1 || __timeValue('market', '', time[1]) !== 1 || timeframe.change('1D')
  },
})
Object.defineProperty(globalThis, 'timeTradingDay', {
  get: () => __timeValue('tradingday', '', time[0]),
})
Object.assign(globalThis, { timeframe, session, timeOpen, timeClose })
