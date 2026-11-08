/** 脚本与行情宿主共享的时间上下文；只包含数据，不携带宿主对象或可写状态。 */
export interface ScriptSessionRange {
  readonly open: number
  readonly close: number
}

export interface ScriptMarketSession {
  readonly slotMinutes?: number
  readonly timeZone: string
  readonly sessions: readonly ScriptSessionRange[]
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
