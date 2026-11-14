/** 脚本与行情宿主共享的时间上下文；只包含数据，不携带宿主对象或可写状态。 */
export interface ScriptSessionRange {
  readonly open: number
  readonly close: number
}

/** 交易日边界：按指定时区的本地时刻切分，用于外汇、期货这类换日不落在午夜的品种。 */
export interface SessionDayBoundary {
  /** 本地换日时刻，`HH:mm` 24 小时制 */
  readonly time: string
  /** IANA 时区名 */
  readonly zone: string
}

export interface ScriptMarketSession {
  readonly slotMinutes?: number
  readonly timeZone: string
  readonly sessions: readonly ScriptSessionRange[]
  readonly tradingDays?: readonly number[]
  /**
   * 可选的交易日边界。配置后 `time_tradingday` 按它切分，而不是按会话时区的午夜；
   * 未配置时保持原语义。外汇常用 `{ time: '17:00', zone: 'America/New_York' }`。
   */
  readonly dayBoundary?: SessionDayBoundary
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
