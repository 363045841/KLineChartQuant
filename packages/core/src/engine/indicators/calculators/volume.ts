import type { KLineData } from '@/foundation/types/price.js'

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
