/** 脚本与行情宿主共享的时间上下文；只包含数据，不携带宿主对象或可写状态。 */
export interface ScriptSessionRange {
  readonly open: number
  readonly close: number
}

export interface ScriptMarketSession {
  readonly slotMinutes?: number
  readonly timeZone: string
  readonly sessions: readonly ScriptSessionRange[]
  /**
   * 交易日起点：市场时区墙钟分钟数（0–1439）。
   *
   * 交易日从该时刻开始计数，用于把跨零点夜盘归入同一交易日；省略表示自然日 00:00。
   * 它只描述归属规则，不扩展 `sessions`：夜盘仍属于下一交易日的行情，而不改变
   * 常规盘时段的槽位语义。
   */
  readonly tradingDayStartMinute?: number
  readonly tradingDays?: readonly number[]
  readonly premarket?: readonly ScriptSessionRange[]
  readonly postmarket?: readonly ScriptSessionRange[]
  readonly approximate?: boolean
  readonly calendars?: readonly {
    readonly year: number
    readonly closedDates: readonly string[]
    readonly specialSessions: readonly { readonly date: string; readonly sessions: readonly ScriptSessionRange[] }[]
    readonly sources?: readonly string[]
    readonly notes?: readonly string[]
  }[]
  readonly extendedSessions?: Readonly<Record<string, {
    readonly premarket: readonly ScriptSessionRange[]
    readonly postmarket: readonly ScriptSessionRange[]
    readonly sources: readonly string[]
  }>>
  readonly sources?: readonly string[]
  readonly notes?: readonly string[]
}

export interface ScriptTimeContext {
  readonly period: string
  readonly session: ScriptMarketSession
}
