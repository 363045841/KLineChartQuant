import { describe, expect, it } from 'vitest'

import {
  createDisplayTimeFormatter,
  createMarketSessionTimeFormatter,
  formatDateTimeInTimeZone,
  resolveDisplayTimeZone,
} from '../dateFormat'

function bars(...timestamps: string[]): Array<{ timestamp: number }> {
  return timestamps.map((timestamp) => ({ timestamp: Date.parse(timestamp) }))
}

describe('display time formatter', () => {
  it('uses the configured IANA zone for labels and date boundaries', () => {
    const utc = createDisplayTimeFormatter('UTC')
    const newYork = createDisplayTimeFormatter('America/New_York')
    const data = bars('2025-02-01T00:30:00Z', '2025-02-01T05:30:00Z')

    expect(utc.formatDate(data[0]!.timestamp)).toBe('2025-02-01')
    expect(newYork.formatDate(data[0]!.timestamp)).toBe('2025-01-31')
    expect(utc.getMonthBoundaries(data)).toEqual([0])
    expect(newYork.getMonthBoundaries(data)).toEqual([0, 1])
  })

  it('handles DST through Intl without offset arithmetic', () => {
    const formatter = createDisplayTimeFormatter('America/New_York')
    expect(formatter.formatDateTime(Date.parse('2025-03-09T06:30:00Z'))).toBe('2025-03-09 01:30')
    expect(formatter.formatDateTime(Date.parse('2025-03-09T07:30:00Z'))).toBe('2025-03-09 03:30')
  })

  it('keeps derived indexes within the formatter context', () => {
    const formatter = createDisplayTimeFormatter('UTC')
    const data = bars('2025-01-31T23:00:00Z', '2025-02-01T00:00:00Z')
    expect(formatter.getMonthBoundaries(data)).toEqual(formatter.getMonthBoundaries(data))
    expect(formatter.getDayBoundaries(data)).toEqual([0, 1])
  })
})

describe('market-session formatter', () => {
  it('uses the market timezone independently of the display formatter', () => {
    const market = createMarketSessionTimeFormatter('America/New_York')
    expect(market.formatAxisTime(Date.parse('2025-01-15T14:30:00Z'))).toBe('09:30')
    expect(formatDateTimeInTimeZone(Date.parse('2025-01-15T14:30:00Z'))).toBe('2025-01-15 22:30')
  })
})

describe('display timezone resolution', () => {
  it('keeps UTC deterministic', () => {
    expect(resolveDisplayTimeZone('UTC')).toBe('UTC')
  })
})
