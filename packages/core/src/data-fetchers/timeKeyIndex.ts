import type { KLineData } from '../controllers/types'

export class TimeKeyIndex {
  private _monthKeys: Int32Array | null = null
  private _dayKeys: Int32Array | null = null

  get monthKeys(): Int32Array | null {
    return this._monthKeys
  }

  get dayKeys(): Int32Array | null {
    return this._dayKeys
  }

  recompute(data: ReadonlyArray<KLineData>): void {
    const n = data.length
    if (n === 0) {
      this._monthKeys = null
      this._dayKeys = null
      return
    }
    const monthKeys = new Int32Array(n)
    const dayKeys = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      const d = new Date(data[i]!.timestamp)
      monthKeys[i] = d.getFullYear() * 12 + d.getMonth()
      const yearStart = new Date(d.getFullYear(), 0, 0)
      dayKeys[i] =
        d.getFullYear() * 366 + Math.floor((d.getTime() - yearStart.getTime()) / 86400000)
    }
    this._monthKeys = monthKeys
    this._dayKeys = dayKeys
  }

  reset(): void {
    this._monthKeys = null
    this._dayKeys = null
  }
}
