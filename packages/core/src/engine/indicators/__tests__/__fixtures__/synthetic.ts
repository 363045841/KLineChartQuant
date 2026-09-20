import type { KLineData } from '@/types/price'

const T0 = 1_700_000_000_000
const MINUTE = 60_000

function bar(
  i: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000,
): KLineData {
  return { timestamp: T0 + i * MINUTE, open, high, low, close, volume }
}

/** `fromCloses` 的可选参数。 */
export interface FromClosesOptions {
  /** 开高低价相对收盘价的对称偏移，默认 0.5 */
  spread?: number
  /** 起始时间戳，默认 T0 */
  timestamp?: number
  /** 第 index 根的成交量；不传则不写 volume 字段 */
  volume?: (index: number) => number
}

/**
 * 由收盘价序列合成 K 线，开高低价按 spread 对称展开。
 * @param closes 收盘价序列。
 * @param options 偏移、起始时间戳与成交量覆盖。
 * @returns 与 closes 等长的 K 线数组。
 */
export function fromCloses(closes: number[], options: FromClosesOptions = {}): KLineData[] {
  const { spread = 0.5, timestamp = T0, volume } = options
  return closes.map((close, index) => ({
    timestamp: timestamp + index * MINUTE,
    open: close - spread,
    high: close + spread,
    low: close - spread,
    close,
    ...(volume ? { volume: volume(index) } : {}),
  }))
}

/**
 * 生成收盘价从 100 起逐根 +1 的线性上涨 K 线。
 * @param length K 线数量。
 * @returns 与 length 等长的 K 线数组。
 */
export function createRisingTrend(length: number): KLineData[] {
  return fromCloses(Array.from({ length }, (_, index) => 100 + index))
}

export const empty: KLineData[] = []

export const singleBar: KLineData[] = [bar(0, 100, 101, 99, 100)]

export const shortSequence: KLineData[] = [
  bar(0, 100, 101, 99, 100),
  bar(1, 100, 102, 99, 101),
  bar(2, 101, 103, 100, 102),
]

export const constantPrice: KLineData[] = Array.from({ length: 30 }, (_, i) =>
  bar(i, 100, 100, 100, 100),
)

export const pureUptrend: KLineData[] = Array.from({ length: 30 }, (_, i) =>
  bar(i, 100 + i, 101 + i, 99 + i, 100 + i),
)

export const pureDowntrend: KLineData[] = Array.from({ length: 30 }, (_, i) =>
  bar(i, 200 - i, 201 - i, 199 - i, 200 - i),
)

export const sideways: KLineData[] = Array.from({ length: 30 }, (_, i) => {
  const phase = (i % 4) - 1.5
  const close = 100 + phase
  return bar(i, 100, 100 + Math.abs(phase) + 0.5, 100 - Math.abs(phase) - 0.5, close)
})

export const spikeAtBar19: KLineData[] = (() => {
  const out: KLineData[] = []
  for (let i = 0; i < 19; i++) out.push(bar(i, 100, 101, 99, 100))
  out.push(bar(19, 100, 110, 95, 105))
  for (let i = 20; i < 25; i++) out.push(bar(i, 105, 106, 104, 105))
  return out
})()

export const gapUp: KLineData[] = (() => {
  const out: KLineData[] = []
  for (let i = 0; i < 10; i++) out.push(bar(i, 100, 101, 99, 100))
  for (let i = 10; i < 20; i++) out.push(bar(i, 110, 111, 109, 110))
  return out
})()

export const FIXTURES = {
  empty,
  singleBar,
  shortSequence,
  constantPrice,
  pureUptrend,
  pureDowntrend,
  sideways,
  spikeAtBar19,
  gapUp,
} as const

export type FixtureName = keyof typeof FIXTURES
