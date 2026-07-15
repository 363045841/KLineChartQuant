import type { KLineData } from '../../../foundation/types/price'

export interface PivotPoint {
  pp: number
  r1: number
  r2: number
  r3: number
  s1: number
  s2: number
  s3: number
}

export function calcPivotData(data: KLineData[]): (PivotPoint | undefined)[] {
  const n = data.length
  const result: (PivotPoint | undefined)[] = new Array(n).fill(undefined)
  if (n < 2) return result
  for (let t = 1; t < n; t++) {
    const p = data[t - 1]!
    const pp = (p.high + p.low + p.close) / 3
    const range = p.high - p.low
    result[t] = {
      pp,
      r1: 2 * pp - p.low,
      s1: 2 * pp - p.high,
      r2: pp + range,
      s2: pp - range,
      r3: p.high + 2 * (pp - p.low),
      s3: p.low - 2 * (p.high - pp),
    }
  }
  return result
}

export interface FibPoint {
  high: number
  low: number
  direction: 'up' | 'down'
  level236: number
  level382: number
  level500: number
  level618: number
  level786: number
}

export function calcFibData(data: KLineData[], period: number): (FibPoint | undefined)[] {
  const n = data.length
  const result: (FibPoint | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0 || n < period) return result

  for (let t = period - 1; t < n; t++) {
    let hi = -Infinity
    let lo = Infinity
    let hiIdx = t
    let loIdx = t
    for (let k = 0; k < period; k++) {
      const bar = data[t - k]!
      if (bar.high > hi) {
        hi = bar.high
        hiIdx = t - k
      }
      if (bar.low < lo) {
        lo = bar.low
        loIdx = t - k
      }
    }
    const direction: 'up' | 'down' = hiIdx >= loIdx ? 'up' : 'down'
    const range = hi - lo
    const level = (frac: number) => (direction === 'up' ? hi - range * frac : lo + range * frac)
    result[t] = {
      high: hi,
      low: lo,
      direction,
      level236: level(0.236),
      level382: level(0.382),
      level500: level(0.5),
      level618: level(0.618),
      level786: level(0.786),
    }
  }
  return result
}

export interface SwingPoint {
  index: number
  price: number
  kind: 'high' | 'low'
  label: 'HH' | 'HL' | 'LH' | 'LL'
  confirmed: boolean
}

export type StructureEventKind = 'BOS' | 'CHOCH'

export interface StructureEvent {
  kind: StructureEventKind
  index: number
  triggerPrice: number
  brokenLevel: number
  brokenSwingIndex: number
  direction: 'up' | 'down'
}

export interface StructureSnapshot {
  swings: SwingPoint[]
  events: StructureEvent[]
  trend: 'up' | 'down' | 'range'
}

function isExtremum(
  data: KLineData[],
  i: number,
  left: number,
  right: number,
  kind: 'high' | 'low',
): boolean {
  const n = data.length
  if (i < left || i + right >= n) return false
  const center = kind === 'high' ? data[i]!.high : data[i]!.low
  for (let k = 1; k <= left; k++) {
    const v = kind === 'high' ? data[i - k]!.high : data[i - k]!.low
    if (kind === 'high' ? v >= center : v <= center) return false
  }
  for (let k = 1; k <= right; k++) {
    const v = kind === 'high' ? data[i + k]!.high : data[i + k]!.low
    if (kind === 'high' ? v >= center : v <= center) return false
  }
  return true
}

export function calcStructureData(
  data: KLineData[],
  leftWindow: number,
  rightWindow: number,
  breakoutSource: 'close' | 'wick',
): StructureSnapshot {
  const n = data.length
  if (n === 0 || leftWindow < 0 || rightWindow < 0) {
    return { swings: [], events: [], trend: 'range' }
  }

  const rawSwings: { index: number; price: number; kind: 'high' | 'low'; confirmed: boolean }[] = []
  for (let i = 0; i < n; i++) {
    const bar = data[i]!
    if (isExtremum(data, i, leftWindow, rightWindow, 'high')) {
      rawSwings.push({ index: i, price: bar.high, kind: 'high', confirmed: i + rightWindow < n })
    }
    if (isExtremum(data, i, leftWindow, rightWindow, 'low')) {
      rawSwings.push({ index: i, price: bar.low, kind: 'low', confirmed: i + rightWindow < n })
    }
  }
  rawSwings.sort((a, b) => a.index - b.index)

  const swings: SwingPoint[] = []
  let lastHigh: { index: number; price: number } | null = null
  let lastLow: { index: number; price: number } | null = null
  for (const s of rawSwings) {
    let label: 'HH' | 'HL' | 'LH' | 'LL'
    if (s.kind === 'high') {
      label = lastHigh && s.price > lastHigh.price ? 'HH' : 'LH'
      lastHigh = { index: s.index, price: s.price }
    } else {
      label = lastLow && s.price > lastLow.price ? 'HL' : 'LL'
      lastLow = { index: s.index, price: s.price }
    }
    swings.push({ ...s, label })
  }

  const events: StructureEvent[] = []
  let trend: 'up' | 'down' | 'range' = 'range'
  let lastSwingHigh: { index: number; price: number } | null = null
  let lastSwingLow: { index: number; price: number } | null = null
  const confirmedSwings = swings.filter((s) => s.confirmed)
  let swingCursor = 0

  for (let t = 0; t < n; t++) {
    while (
      swingCursor < confirmedSwings.length &&
      confirmedSwings[swingCursor]!.index + rightWindow <= t
    ) {
      const s = confirmedSwings[swingCursor]!
      if (s.kind === 'high') lastSwingHigh = { index: s.index, price: s.price }
      else lastSwingLow = { index: s.index, price: s.price }
      swingCursor++
    }

    const bar = data[t]!
    const upBreakPrice = breakoutSource === 'close' ? bar.close : bar.high
    const downBreakPrice = breakoutSource === 'close' ? bar.close : bar.low

    if (lastSwingHigh && upBreakPrice > lastSwingHigh.price) {
      const kind: StructureEventKind = trend === 'down' ? 'CHOCH' : 'BOS'
      events.push({
        kind,
        index: t,
        triggerPrice: upBreakPrice,
        brokenLevel: lastSwingHigh.price,
        brokenSwingIndex: lastSwingHigh.index,
        direction: 'up',
      })
      trend = 'up'
      lastSwingHigh = null
    } else if (lastSwingLow && downBreakPrice < lastSwingLow.price) {
      const kind: StructureEventKind = trend === 'up' ? 'CHOCH' : 'BOS'
      events.push({
        kind,
        index: t,
        triggerPrice: downBreakPrice,
        brokenLevel: lastSwingLow.price,
        brokenSwingIndex: lastSwingLow.index,
        direction: 'down',
      })
      trend = 'down'
      lastSwingLow = null
    }
  }

  return { swings, events, trend }
}

export type ZoneKind = 'FVG_BULL' | 'FVG_BEAR' | 'OB_BULL' | 'OB_BEAR'

export interface Zone {
  kind: ZoneKind
  startIndex: number
  endIndex?: number
  high: number
  low: number
}

export function calcZonesData(
  data: KLineData[],
  obLookback: number,
  structureLeftWindow: number,
  structureRightWindow: number,
  breakoutSource: 'close' | 'wick',
): Zone[] {
  const n = data.length
  if (n < 3) return []
  const zones: Zone[] = []

  for (let t = 2; t < n; t++) {
    const a = data[t - 2]!
    const c = data[t]!
    if (a.high < c.low) {
      zones.push({
        kind: 'FVG_BULL',
        startIndex: t - 1,
        high: c.low,
        low: a.high,
      })
    }
    if (a.low > c.high) {
      zones.push({
        kind: 'FVG_BEAR',
        startIndex: t - 1,
        high: a.low,
        low: c.high,
      })
    }
  }

  const struct = calcStructureData(data, structureLeftWindow, structureRightWindow, breakoutSource)
  for (const ev of struct.events) {
    if (ev.kind !== 'BOS') continue
    const start = Math.max(0, ev.index - obLookback)
    if (ev.direction === 'up') {
      for (let k = ev.index - 1; k >= start; k--) {
        const bar = data[k]!
        if (bar.close < bar.open) {
          zones.push({ kind: 'OB_BULL', startIndex: k, high: bar.high, low: bar.low })
          break
        }
      }
    } else {
      for (let k = ev.index - 1; k >= start; k--) {
        const bar = data[k]!
        if (bar.close > bar.open) {
          zones.push({ kind: 'OB_BEAR', startIndex: k, high: bar.high, low: bar.low })
          break
        }
      }
    }
  }

  for (const zone of zones) {
    for (let t = zone.startIndex + 1; t < n; t++) {
      const bar = data[t]!
      if (bar.low <= zone.high && bar.high >= zone.low) {
        zone.endIndex = t
        break
      }
    }
  }

  return zones
}
