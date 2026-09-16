import { describe, expect, it } from 'vitest'

import { parseRetryAfter } from '../provider-openai-compatible/http'

describe('parseRetryAfter', () => {
  it('parses a non-negative delay in seconds', () => {
    expect(parseRetryAfter('0')).toBe(0)
    expect(parseRetryAfter('5')).toBe(5_000)
    expect(parseRetryAfter('1.5')).toBe(1_500)
  })

  it('rejects a negative delay instead of falling through to the date branch', () => {
    // `Date.parse('-5')` succeeds — it reads as a year — and would otherwise
    // yield a 2001 timestamp, i.e. a ~31 year delay when `now` is small.
    expect(parseRetryAfter('-5')).toBeUndefined()
    expect(parseRetryAfter('-5', 0)).toBeUndefined()
    expect(parseRetryAfter('-0.1')).toBeUndefined()
  })

  it('parses an HTTP date relative to now', () => {
    const now = Date.parse('2026-01-01T00:00:00Z')
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:30 GMT', now)).toBe(30_000)
  })

  it('clamps a past HTTP date to zero', () => {
    const now = Date.parse('2026-01-01T00:01:00Z')
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:00 GMT', now)).toBe(0)
  })

  it('returns undefined for absent or unparsable values', () => {
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('')).toBeUndefined()
    expect(parseRetryAfter('not-a-date')).toBeUndefined()
  })
})
