/**
 * 原始链采样节奏单元测试：采样分钟由采集时刻决定，跨进程也不需要额外状态。
 */
import { describe, expect, it } from 'vitest'
import { isChainCaptureMinute } from '../options/impl/chainCadence'

/** 一分钟的毫秒数。 */
const MINUTE = 60_000

/** 2026-11-10T03:00:00Z：整点，落在所有间隔的采样分钟上。 */
const HOUR_START = Date.UTC(2026, 10, 10, 3, 0, 0)

describe('isChainCaptureMinute', () => {
  it('间隔 5 分钟：整 5 分钟、10 分钟…落链，其余分钟不落', () => {
    expect(isChainCaptureMinute(HOUR_START, 5)).toBe(true)
    expect(isChainCaptureMinute(HOUR_START + 4 * MINUTE, 5)).toBe(false)
    expect(isChainCaptureMinute(HOUR_START + 5 * MINUTE, 5)).toBe(true)
    expect(isChainCaptureMinute(HOUR_START + 10 * MINUTE, 5)).toBe(true)
    expect(isChainCaptureMinute(HOUR_START + 55 * MINUTE, 5)).toBe(true)
  })

  it('判定只看所在分钟，不看分钟内的偏移', () => {
    expect(isChainCaptureMinute(HOUR_START + 3_000, 5)).toBe(true)
    expect(isChainCaptureMinute(HOUR_START + 5 * MINUTE + 59_999, 5)).toBe(true)
    expect(isChainCaptureMinute(HOUR_START + 5 * MINUTE - 1, 5)).toBe(false)
  })

  it('间隔 1 分钟：每分钟都落链', () => {
    for (let minute = 0; minute < 10; minute += 1) {
      expect(isChainCaptureMinute(HOUR_START + minute * MINUTE, 1)).toBe(true)
    }
  })

  it('间隔 7 分钟：相邻两次采样恒差 7 分钟，跨小时不重置相位', () => {
    const hits: number[] = []
    for (let minute = 0; minute < 6 * 60; minute += 1) {
      if (isChainCaptureMinute(HOUR_START + minute * MINUTE, 7)) {
        hits.push(minute)
      }
    }
    expect(hits.length).toBeGreaterThanOrEqual(50)
    for (let index = 1; index < hits.length; index += 1) {
      expect(hits[index] - hits[index - 1]).toBe(7)
    }
  })
})
