import type { KLineData, SymbolSpec } from '../../controllers/types'

const COMPARISON_PALETTE = ['#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316']
const DEFAULT_COMPARISON_COLOR = '#f59e0b'
const BUF_COMPARISON = 'cmp'

export interface ComparisonHooks {
  createComparisonBuffer(spec: SymbolSpec): {
    key: string
    buffer: import('../../data/dataBufferTypes').KLineBuffer
  }
  disposeBuffer(key: string): void
  getKLineBuffer(key: string): import('../../data/dataBufferTypes').KLineBuffer | undefined
  hasKLineBuffer(key: string): boolean
  getKLineBufferKeys(): string[]
  scheduleDraw(): void
  /** kernel comparison.readonly.colors */
  getColors(): ReadonlyMap<string, string>
  setColors(colors: ReadonlyMap<string, string>): void
  setLoading(loading: boolean): void
}

export class ComparisonManager {
  private _specs: SymbolSpec[] = []
  private _cmpLoadingUnsubs = new Map<string, () => void>()
  private _hooks: ComparisonHooks

  constructor(hooks: ComparisonHooks) {
    this._hooks = hooks
  }

  get specs(): SymbolSpec[] {
    return this._specs.map((s) => ({ ...s }))
  }

  get data(): Map<string, KLineData[]> {
    const result = new Map<string, KLineData[]>()
    for (const spec of this._specs) {
      const key = `cmp:${spec.symbol}:${spec.period ?? 'daily'}`
      const buf = this._hooks.getKLineBuffer(key)
      if (buf) result.set(spec.symbol, [...buf.getRawData()])
    }
    return result
  }

  getColors(): Map<string, string> {
    return new Map(this._hooks.getColors())
  }

  syncBuffers(specs: ReadonlyArray<SymbolSpec>, mainEarliest?: number): void {
    this._specs = specs.map((s) => ({ ...s }))
    const nextKeys = new Set(specs.map((s) => s.symbol))

    for (const key of this._hooks.getKLineBufferKeys()) {
      if (!key.startsWith(BUF_COMPARISON)) continue
      const symbol = key.split(':')[1]!
      if (nextKeys.has(symbol)) continue
      this._hooks.disposeBuffer(key)
    }

    // 同步颜色：保留仍在用的，为新增分配 palette
    const prevColors = this._hooks.getColors()
    const nextColors = new Map<string, string>()
    for (const spec of specs) {
      const existing = prevColors.get(spec.symbol)
      if (existing) {
        nextColors.set(spec.symbol, existing)
      } else {
        nextColors.set(
          spec.symbol,
          COMPARISON_PALETTE[nextColors.size % COMPARISON_PALETTE.length] ??
            DEFAULT_COMPARISON_COLOR,
        )
      }
    }
    this._hooks.setColors(nextColors)

    for (const spec of specs) {
      const key = `cmp:${spec.symbol}:${spec.period ?? 'daily'}`
      let buf = this._hooks.getKLineBuffer(key)
      if (!buf) {
        const created = this._hooks.createComparisonBuffer(spec)
        buf = created.buffer

        const unsub = buf.data.subscribe(() => {
          this._hooks.scheduleDraw()
        })
        this._cmpLoadingUnsubs.set(key, unsub)

        const unsubLoading = buf.loading.subscribe(() => this._recomputeLoading())
        this._cmpLoadingUnsubs.set(`loading:${key}`, unsubLoading)
      }
      buf.setSymbol(spec, mainEarliest)
    }
  }

  clearAll(): void {
    for (const key of this._hooks.getKLineBufferKeys()) {
      if (key.startsWith(BUF_COMPARISON)) {
        this._hooks.disposeBuffer(key)
      }
    }
    for (const unsub of this._cmpLoadingUnsubs.values()) unsub()
    this._cmpLoadingUnsubs.clear()
    this._hooks.setColors(new Map())
    this._hooks.setLoading(false)
    this._specs = []
  }

  addSymbol(spec: SymbolSpec, onComplete: () => void): void {
    const symbol = spec.symbol

    for (const k of this._hooks.getKLineBufferKeys()) {
      if (k.startsWith(BUF_COMPARISON) && k.split(':')[1] === symbol) return
    }

    this._specs.push({ ...spec })

    const prev = this._hooks.getColors()
    if (!prev.has(symbol)) {
      const next = new Map(prev)
      next.set(
        symbol,
        COMPARISON_PALETTE[next.size % COMPARISON_PALETTE.length] ?? DEFAULT_COMPARISON_COLOR,
      )
      this._hooks.setColors(next)
    }

    const key = `cmp:${symbol}:${spec.period ?? 'daily'}`

    if (!this._hooks.hasKLineBuffer(key)) {
      const created = this._hooks.createComparisonBuffer(spec)
      const buf = created.buffer

      const unsub = buf.data.subscribe(() => {
        this._hooks.scheduleDraw()
      })
      this._cmpLoadingUnsubs.set(key, unsub)

      const unsubLoading = buf.loading.subscribe(() => this._recomputeLoading())
      this._cmpLoadingUnsubs.set(`loading:${key}`, unsubLoading)

      buf.setSymbol(spec)
    }

    onComplete()
  }

  setData(symbol: string, data: KLineData[], onNewBuffer: (key: string) => void): void {
    const period = 'daily'
    const key = `cmp:${symbol}:${period}`

    const existing = this._hooks.getKLineBuffer(key)
    if (!existing) {
      const buffer = this._hooks.createComparisonBuffer({
        symbol,
        period,
      }).buffer

      const unsub = buffer.data.subscribe(() => {
        this._hooks.scheduleDraw()
      })
      this._cmpLoadingUnsubs.set(key, unsub)

      const unsubLoading = buffer.loading.subscribe(() => this._recomputeLoading())
      this._cmpLoadingUnsubs.set(`loading:${key}`, unsubLoading)

      const prev = this._hooks.getColors()
      if (!prev.has(symbol)) {
        const next = new Map(prev)
        next.set(
          symbol,
          COMPARISON_PALETTE[next.size % COMPARISON_PALETTE.length] ?? DEFAULT_COMPARISON_COLOR,
        )
        this._hooks.setColors(next)
      }

      const spec: SymbolSpec = { symbol, period }
      this._specs.push(spec)

      buffer.setInlineData(data)
      onNewBuffer(key)
      return
    }
    existing.setInlineData(data)
  }

  removeSymbol(symbol: string): boolean {
    let found = false
    for (const key of this._hooks.getKLineBufferKeys()) {
      if (key.startsWith(BUF_COMPARISON) && key.split(':')[1] === symbol) {
        this._hooks.disposeBuffer(key)
        this._cmpLoadingUnsubs.get(key)?.()
        this._cmpLoadingUnsubs.get(`loading:${key}`)?.()
        this._cmpLoadingUnsubs.delete(key)
        this._cmpLoadingUnsubs.delete(`loading:${key}`)
        found = true
        break
      }
    }
    if (!found) return false

    const next = new Map(this._hooks.getColors())
    next.delete(symbol)
    this._hooks.setColors(next)
    this._specs = this._specs.filter((s) => s.symbol !== symbol)
    this._recomputeLoading()
    return true
  }

  ensureRange(firstVisibleTs: number, windowEarliestTs: number): void {
    for (const key of this._hooks.getKLineBufferKeys()) {
      if (key.startsWith(BUF_COMPARISON)) {
        this._hooks.getKLineBuffer(key)?.ensureRange(firstVisibleTs, windowEarliestTs)
      }
    }
  }

  private _recomputeLoading(): void {
    const anyLoading = [...this._hooks.getKLineBufferKeys()].some(
      (k) => k.startsWith(BUF_COMPARISON) && this._hooks.getKLineBuffer(k)?.loading.peek(),
    )
    this._hooks.setLoading(anyLoading)
  }
}
