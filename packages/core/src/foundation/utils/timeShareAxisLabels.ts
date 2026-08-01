import {
  ASHARE_MARKET_SESSION,
  ASHARE_OPEN_SESSIONS,
  computeSessionTimeLabels,
  countSessionSlots,
  minuteOfDayToTimestamp,
  resolveTimestampSessionSlot,
  resolveMarketSessionSlots,
  sessionSlotCenterX,
  type MarketSessionConfig,
  type SessionTimeLabel,
} from './sessionTimeLabels'

/** A 股默认全天 1 分钟槽位数（兼容旧导出） */
export const ASHARE_TIMESHARE_SESSION_SLOTS = resolveMarketSessionSlots(ASHARE_MARKET_SESSION)

/** 分时时间标签最小水平间距（逻辑像素） */
export const TIMESHARE_MIN_LABEL_SPACING_PX = 56

export type TimeShareTimeLabelInput = {
  axisWidth: number
  /** 市场 session；默认 A 股 */
  marketSession?: MarketSessionConfig
  minLabelSpacingPx?: number
}

/**
 * 分时时间标签索引（委托 computeSessionTimeLabels）。
 * 默认 A 股；传入 marketSession 可换港股/美股等。
 */
export function computeTimeShareTimeLabelIndices(input: TimeShareTimeLabelInput): number[] {
  return computeTimeShareTimeLabels(input).map((l) => l.slotIndex)
}

/** 完整标签（含 minuteOfDay / isEndpoint） */
export function computeTimeShareTimeLabels(input: TimeShareTimeLabelInput): SessionTimeLabel[] {
  const market = input.marketSession ?? ASHARE_MARKET_SESSION
  return computeSessionTimeLabels(market.sessions, {
    axisWidth: input.axisWidth,
    minLabelSpacingPx: input.minLabelSpacingPx ?? TIMESHARE_MIN_LABEL_SPACING_PX,
  })
}

export function timeShareSlotCenterX(
  slotIndex: number,
  axisWidth: number,
  sessionSlots: number,
  dpr: number,
): number {
  return sessionSlotCenterX(slotIndex, axisWidth, sessionSlots, dpr)
}

/**
 * 由开盘日基准时间戳 + slot 索引推算标签时间（按 market session）。
 */
export function resolveTimeShareSlotTimestamp(
  baseTimestamp: number,
  slotIndex: number,
  marketSession: MarketSessionConfig = ASHARE_MARKET_SESSION,
): number {
  const step = marketSession.slotMinutes && marketSession.slotMinutes > 0 ? marketSession.slotMinutes : 1
  let remaining = slotIndex * step
  for (const range of marketSession.sessions) {
    const len = range.close - range.open
    if (remaining < len) {
      return minuteOfDayToTimestamp(
        baseTimestamp,
        range.open + remaining,
        marketSession.timeZone,
      )
    }
    remaining -= len
  }
  const last = marketSession.sessions[marketSession.sessions.length - 1]
  if (last) {
    return minuteOfDayToTimestamp(baseTimestamp, last.close, marketSession.timeZone)
  }
  return baseTimestamp
}

export {
  ASHARE_MARKET_SESSION,
  ASHARE_OPEN_SESSIONS,
  computeSessionTimeLabels,
  countSessionSlots,
  minuteOfDayToTimestamp,
  resolveTimestampSessionSlot,
  resolveMarketSessionSlots,
  sessionSlotCenterX,
}
export type {
  MarketSessionConfig,
  OpenTimeRange,
  SessionTimeLabel,
} from './sessionTimeLabels'
export { HK_MARKET_SESSION, US_MARKET_SESSION } from './sessionTimeLabels'
