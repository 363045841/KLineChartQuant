import type { TradingCalendar } from '../provider/types.js'

/** 与 K 线数组隔离的未来槽位时间戳快照。 */
export class TradingCalendarStore {
  private calendar: TradingCalendar | null = null

  clear(): void {
    this.calendar = null
  }

  covers(anchorTimestamp: number, count: number): boolean {
    return (
      this.calendar?.anchorTimestamp === anchorTimestamp &&
      this.calendar.futureTimestamps.length >= count
    )
  }

  set(calendar: TradingCalendar, anchorTimestamp: number): boolean {
    if (calendar.anchorTimestamp !== anchorTimestamp || !Number.isFinite(anchorTimestamp))
      return false
    let previous = anchorTimestamp
    for (const timestamp of calendar.futureTimestamps) {
      if (!Number.isFinite(timestamp) || timestamp <= previous) return false
      previous = timestamp
    }
    this.calendar = { anchorTimestamp, futureTimestamps: [...calendar.futureTimestamps] }
    return true
  }

  advance(anchorTimestamp: number): void {
    if (!this.calendar || this.calendar.anchorTimestamp === anchorTimestamp) return
    const index = this.calendar.futureTimestamps.indexOf(anchorTimestamp)
    if (index < 0) {
      this.clear()
      return
    }
    this.calendar = {
      anchorTimestamp,
      futureTimestamps: this.calendar.futureTimestamps.slice(index + 1),
    }
  }

  at(anchorTimestamp: number, offset: number): number | null {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      this.calendar?.anchorTimestamp !== anchorTimestamp
    )
      return null
    return this.calendar.futureTimestamps[offset] ?? null
  }
}
