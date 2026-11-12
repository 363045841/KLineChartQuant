/**
 * 时间语义的公共契约：展示格式化、日历刻度与时间投影。
 *
 * 渲染层只消费这里的实例与结果，不直接构造 Intl，也不在帧循环里格式化单个时间戳。
 */

export type TimeZoneSetting = 'UTC' | 'local'

/** 时间轴刻度标记的日历单位；标签粒度只到日 / 月 / 年，不出现时分。 */
export type TimeTickUnit = 'day' | 'month' | 'year'

/** 一个时间轴刻度：吸附到逻辑槽位后的时间、标签与主刻度标记。 */
export interface TimeTick {
  /** 吸附后的真实时间戳；留白槽位是常规槽距推算值。 */
  readonly time: number
  /** 吸附后的整数逻辑槽位；网格线与时间轴共用同一落点。 */
  readonly index: number
  readonly label: string
  /** 主刻度（年界）由调用方加粗并优先占位。 */
  readonly major: boolean
}

/** 时间的展示格式化：同一实例按时区复用 Intl formatter。 */
export interface TimeFormatter {
  readonly timeZone: string
  /** `2025-02-01` */
  formatDate(timestamp: number): string
  /** `2025-02-01 09:30` */
  formatDateTime(timestamp: number): string
  /** `周六 2025-02-01` */
  formatDateWithWeekday(timestamp: number): string
  /** `周六 2025-02-01 09:30` */
  formatDateTimeWithWeekday(timestamp: number): string
}

/** 市场时段格式化：与展示时区分离，固定按交易所时区出 `HH:mm`。 */
export interface MarketSessionTimeFormatter {
  readonly timeZone: string
  formatAxisTime(timestamp: number): string
}

/** 时间轴刻度所需的时间投影；帧坐标服务实现它，刻度不依赖像素与价格。 */
export interface TimeProjection {
  /** 连续逻辑位置 → 毫秒时间戳；两端按常规槽距外推。 */
  logicalToTime(index: number): number | null
  /** 毫秒时间戳 → 连续逻辑位置；真实行情之间插值。 */
  timeToLogical(timestamp: number): number | null
}
