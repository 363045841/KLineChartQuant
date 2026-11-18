/**
 * Agent 图元时间契约测试：RFC 3339 读写、日期简写与失败原因。
 *
 * 日期只由 bar 时间戳与图表时区派生；用例不构造任何按日缓存字段。
 * 槽位吸附属于渲染层，不在本模块。
 */
import { describe, expect, it } from 'vitest'
import { formatDrawingAnchorTime, parseDrawingAnchorTime } from '../drawingAnchorTime'

const TIMEZONE = 'Asia/Shanghai'

/** 两个交易日的行情快照；bar 只有时间戳，没有日期字段。 */
const BARS = [
  { timestamp: Date.parse('2026-11-17T09:30:00+08:00') },
  { timestamp: Date.parse('2026-11-18T09:30:00+08:00') },
]

/** 构造解析输入；默认是日线，用例只声明差异。 */
function input(
  overrides: {
    bars?: ReadonlyArray<{ readonly timestamp: number }>
    period?: string
    timezone?: string
  } = {},
) {
  return {
    bars: overrides.bars ?? BARS,
    period: overrides.period ?? 'daily',
    timezone: overrides.timezone ?? TIMEZONE,
  }
}

describe('drawing anchor time', () => {
  it.each([
    { time: '2026-11-18T09:31:00+08:00', expected: Date.parse('2026-11-18T09:31:00+08:00') },
    { time: '2026-11-18T01:31:00Z', expected: Date.parse('2026-11-18T01:31:00Z') },
    { time: '2026-11-18T09:31+08:00', expected: Date.parse('2026-11-18T09:31:00+08:00') },
  ])('带偏移量的 RFC 3339 原样解析：$time', ({ time, expected }) => {
    expect(parseDrawingAnchorTime(time, input())).toBe(expected)
  })

  it.each([
    { name: '没有偏移量的本地时间', time: '2026-11-18T09:31' },
    { name: '非时间文本', time: 'tomorrow' },
  ])('拒绝无法确定瞬间的输入：$name', ({ time }) => {
    expect(() => parseDrawingAnchorTime(time, input())).toThrow(
      /is not an RFC 3339 time with an offset/,
    )
  })

  it('日线及以上把日期简写解析为当天首根 K 线', () => {
    expect(parseDrawingAnchorTime('2026-11-18', input())).toBe(BARS[1]!.timestamp)
  })

  it('末尾 K 线没有日期字段时仍能按日期命中', () => {
    const tail = [{ timestamp: Date.parse('2026-11-18T00:00:00+08:00') }]
    expect(parseDrawingAnchorTime('2026-11-18', input({ bars: tail }))).toBe(tail[0]!.timestamp)
  })

  it('日期按图表时区派生，不受 bar 字段影响', () => {
    const utcMidnight = [{ timestamp: Date.parse('2026-11-17T16:00:00Z') }]
    expect(parseDrawingAnchorTime('2026-11-18', input({ bars: utcMidnight }))).toBe(
      utcMidnight[0]!.timestamp,
    )
  })

  it('日内周期拒绝日期简写，避免所有锚点落到当天首根 K 线', () => {
    expect(() => parseDrawingAnchorTime('2026-11-18', input({ period: '5min' }))).toThrow(
      /This chart is 5min; include the time and offset/,
    )
  })

  it('超出已加载范围时给出范围', () => {
    expect(() => parseDrawingAnchorTime('2026-12-01', input())).toThrow(
      /outside the loaded range 2026-11-17\.\.2026-11-18/,
    )
  })

  it('范围内的非交易日单独报错', () => {
    const gapped = [
      { timestamp: Date.parse('2026-11-16T09:30:00+08:00') },
      { timestamp: Date.parse('2026-11-18T09:30:00+08:00') },
    ]
    expect(() => parseDrawingAnchorTime('2026-11-17', input({ bars: gapped }))).toThrow(
      /No bar exists on 2026-11-17/,
    )
  })

  it('没有已加载行情时报数据缺失，而不是范围错误', () => {
    expect(() => parseDrawingAnchorTime('2026-11-18', input({ bars: [] }))).toThrow(
      /No K-line data is loaded/,
    )
  })

  it('格式化结果可以被解析回同一时刻', () => {
    const timestamp = Date.parse('2026-11-18T09:31:00+08:00')
    const text = formatDrawingAnchorTime(timestamp, TIMEZONE)
    expect(text).toBe('2026-11-18T09:31:00+08:00')
    expect(parseDrawingAnchorTime(text, input())).toBe(timestamp)
  })
})
