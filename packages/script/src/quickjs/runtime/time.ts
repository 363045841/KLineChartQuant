/** Pine风格时间门面；计算委派宿主共享实现，QuickJS与原生后端保持一致。 */
const timeframe = Object.freeze({
  get period() { return __requestContext.time?.period ?? '' },
  in_seconds(period = timeframe.period): number { return __timeframeSeconds(period) },
  change(period: string): boolean {
    return __count() > 0 && (__count() === 1 || __timeValue('open', period, time[0]) !== __timeValue('open', period, time[1]))
  },
})

/** 指定周期的收盘时间；自定义时段外返回NaN。 */
function time_close(period = timeframe.period, session?: string, timezone?: string): number {
  return __timeValue('close', period, time[0], session, timezone)
}

const session = Object.freeze({
  get ismarket() { return __timeValue('market', '', time[0]) === 1 },
  get ispremarket() { return __timeValue('premarket', '', time[0]) === 1 },
  get ispostmarket() { return __timeValue('postmarket', '', time[0]) === 1 },
  get isfirstbar() { return timeframe.change('1D') },
  get isfirstbar_regular() {
    if (!session.ismarket) return false
    return __count() === 1 || __timeValue('market', '', time[1]) !== 1 || timeframe.change('1D')
  },
})
Object.defineProperty(globalThis, 'time_tradingday', { get: () => __timeValue('tradingday', '', time[0]) })
Object.assign(globalThis, { timeframe, session, time_close })
