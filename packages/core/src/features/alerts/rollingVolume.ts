import type { MarketSnapshot } from './types'

export class RollingVolumeCalculator {
  private buffer: number[]
  private sum = 0
  private cursor = 0
  private filled = false

  constructor(public readonly size: number) {
    this.buffer = new Array(size)
  }

  push(volume: number): number {
    if (this.filled) {
      this.sum -= this.buffer[this.cursor]!
    }
    this.buffer[this.cursor] = volume
    this.sum += volume
    this.cursor = (this.cursor + 1) % this.size
    if (!this.filled && this.cursor === 0) {
      this.filled = true
    }
    return this.mean
  }

  get mean(): number {
    const count = this.filled ? this.size : this.cursor
    return count > 0 ? this.sum / count : 0
  }
}

export type VolumeLookbacks = Map<number, RollingVolumeCalculator>

export function createVolumeLookbacks(sizes: number[]): VolumeLookbacks {
  const map = new Map<number, RollingVolumeCalculator>()
  for (const size of sizes) {
    map.set(size, new RollingVolumeCalculator(size))
  }
  return map
}

export function pushToVolumeLookbacks(
  lookbacks: VolumeLookbacks,
  volume: number,
): MarketSnapshot['rollingVolume'] {
  const result: Record<number, number> = {}
  for (const [size, calc] of lookbacks) {
    result[size] = calc.push(volume)
  }
  return result
}
