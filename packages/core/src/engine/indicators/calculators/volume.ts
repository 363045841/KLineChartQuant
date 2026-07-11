import type { KLineData } from '../../../foundation/types/price'

export function calcVMAData(data: KLineData[], period: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0 || n < period) return result
  let sum = 0
  for (let i = 0; i < period; i++) sum += data[i]!.volume ?? 0
  result[period - 1] = sum / period
  for (let t = period; t < n; t++) {
    sum += (data[t]!.volume ?? 0) - (data[t - period]!.volume ?? 0)
    result[t] = sum / period
  }
  return result
}

export function calcOBVData(data: KLineData[]): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0) return result
  let obv = 0
  result[0] = 0
  for (let t = 1; t < n; t++) {
    const cur = data[t]!
    const prev = data[t - 1]!
    if (cur.close > prev.close) obv += cur.volume ?? 0
    else if (cur.close < prev.close) obv -= cur.volume ?? 0
    result[t] = obv
  }
  return result
}

export function calcPVTData(data: KLineData[]): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0) return result
  let pvt = 0
  result[0] = 0
  for (let t = 1; t < n; t++) {
    const prevClose = data[t - 1]!.close
    if (prevClose === 0) {
      result[t] = pvt
      continue
    }
    pvt += ((data[t]!.close - prevClose) / prevClose) * (data[t]!.volume ?? 0)
    result[t] = pvt
  }
  return result
}

export function calcVWAPData(data: KLineData[], sessionResetGapMs: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0) return result

  let cumPV = 0
  let cumV = 0
  let prevTs = data[0]!.timestamp

  for (let t = 0; t < n; t++) {
    const bar = data[t]!
    if (sessionResetGapMs > 0 && t > 0 && bar.timestamp - prevTs > sessionResetGapMs) {
      cumPV = 0
      cumV = 0
    }
    const tp = (bar.high + bar.low + bar.close) / 3
    cumPV += tp * (bar.volume ?? 0)
    cumV += bar.volume ?? 0
    result[t] = cumV > 0 ? cumPV / cumV : tp
    prevTs = bar.timestamp
  }

  return result
}

export function calcCMFData(data: KLineData[], period: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n === 0 || period <= 0 || n < period) return result

  const mfv: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const bar = data[i]!
    const range = bar.high - bar.low
    const mfm = range > 0 ? (bar.close - bar.low - (bar.high - bar.close)) / range : 0
    mfv[i] = mfm * (bar.volume ?? 0)
  }

  let sumMFV = 0
  let sumV = 0
  for (let i = 0; i < period; i++) {
    sumMFV += mfv[i]!
    sumV += data[i]!.volume ?? 0
  }
  result[period - 1] = sumV > 0 ? sumMFV / sumV : 0

  for (let t = period; t < n; t++) {
    sumMFV += mfv[t]! - mfv[t - period]!
    sumV += (data[t]!.volume ?? 0) - (data[t - period]!.volume ?? 0)
    result[t] = sumV > 0 ? sumMFV / sumV : 0
  }
  return result
}

export function calcMFIData(data: KLineData[], period: number): (number | undefined)[] {
  const n = data.length
  const result: (number | undefined)[] = new Array(n).fill(undefined)
  if (n < period + 1 || period <= 0) return result

  const tp: number[] = new Array(n)
  for (let i = 0; i < n; i++) tp[i] = (data[i]!.high + data[i]!.low + data[i]!.close) / 3

  const pmfArr: number[] = new Array(n)
  const nmfArr: number[] = new Array(n)
  pmfArr[0] = 0
  nmfArr[0] = 0
  for (let i = 1; i < n; i++) {
    const rmf = tp[i]! * (data[i]!.volume ?? 0)
    if (tp[i]! > tp[i - 1]!) {
      pmfArr[i] = rmf
      nmfArr[i] = 0
    } else if (tp[i]! < tp[i - 1]!) {
      pmfArr[i] = 0
      nmfArr[i] = rmf
    } else {
      pmfArr[i] = 0
      nmfArr[i] = 0
    }
  }

  let pSum = 0
  let nSum = 0
  for (let i = 1; i <= period; i++) {
    pSum += pmfArr[i]!
    nSum += nmfArr[i]!
  }
  result[period] = nSum > 0 ? 100 - 100 / (1 + pSum / nSum) : 100

  for (let t = period + 1; t < n; t++) {
    pSum += pmfArr[t]! - pmfArr[t - period]!
    nSum += nmfArr[t]! - nmfArr[t - period]!
    result[t] = nSum > 0 ? 100 - 100 / (1 + pSum / nSum) : 100
  }
  return result
}

export interface VolumeProfileBin {
  priceLow: number
  priceHigh: number
  volume: number
}

export interface VolumeProfileResult {
  bins: VolumeProfileBin[]
  poc: number
  vah: number
  val: number
  totalVolume: number
}

export function calcVolumeProfileData(
  data: KLineData[],
  bins: number,
  lookback: number,
  valueAreaPercent: number,
): VolumeProfileResult {
  const n = data.length
  if (n === 0 || bins <= 0) {
    return { bins: [], poc: 0, vah: 0, val: 0, totalVolume: 0 }
  }

  const startIdx = lookback > 0 ? Math.max(0, n - lookback) : 0
  let priceMin = Infinity
  let priceMax = -Infinity
  for (let i = startIdx; i < n; i++) {
    const bar = data[i]!
    if (bar.low < priceMin) priceMin = bar.low
    if (bar.high > priceMax) priceMax = bar.high
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax) || priceMax <= priceMin) {
    return { bins: [], poc: priceMin, vah: priceMin, val: priceMin, totalVolume: 0 }
  }

  const binWidth = (priceMax - priceMin) / bins
  const binVolumes: number[] = new Array(bins).fill(0)

  for (let i = startIdx; i < n; i++) {
    const bar = data[i]!
    const barRange = bar.high - bar.low
    if (barRange <= 0) {
      const binIdx = Math.min(bins - 1, Math.max(0, Math.floor((bar.close - priceMin) / binWidth)))
      binVolumes[binIdx]! += bar.volume ?? 0
      continue
    }
    const volPerPrice = (bar.volume ?? 0) / barRange
    const startBin = Math.max(0, Math.floor((bar.low - priceMin) / binWidth))
    const endBin = Math.min(bins - 1, Math.floor((bar.high - priceMin) / binWidth))
    for (let b = startBin; b <= endBin; b++) {
      const binLow = priceMin + b * binWidth
      const binHigh = binLow + binWidth
      const overlapLow = Math.max(bar.low, binLow)
      const overlapHigh = Math.min(bar.high, binHigh)
      const overlap = overlapHigh - overlapLow
      if (overlap > 0) {
        binVolumes[b]! += overlap * volPerPrice
      }
    }
  }

  const binsArr: VolumeProfileBin[] = binVolumes.map((v, b) => ({
    priceLow: priceMin + b * binWidth,
    priceHigh: priceMin + (b + 1) * binWidth,
    volume: v,
  }))

  let pocBinIdx = 0
  for (let b = 1; b < bins; b++) {
    if (binVolumes[b]! > binVolumes[pocBinIdx]!) pocBinIdx = b
  }
  const poc = (binsArr[pocBinIdx]!.priceLow + binsArr[pocBinIdx]!.priceHigh) / 2

  const totalVolume = binVolumes.reduce((a, b) => a + b, 0)

  const target = totalVolume * valueAreaPercent
  let acc = binVolumes[pocBinIdx]!
  let lo = pocBinIdx
  let hi = pocBinIdx
  while (acc < target && (lo > 0 || hi < bins - 1)) {
    const loCand = lo > 0 ? binVolumes[lo - 1]! : -Infinity
    const hiCand = hi < bins - 1 ? binVolumes[hi + 1]! : -Infinity
    if (loCand >= hiCand && lo > 0) {
      lo--
      acc += binVolumes[lo]!
    } else if (hi < bins - 1) {
      hi++
      acc += binVolumes[hi]!
    } else {
      break
    }
  }
  const val = binsArr[lo]!.priceLow
  const vah = binsArr[hi]!.priceHigh

  return { bins: binsArr, poc, vah, val, totalVolume }
}
