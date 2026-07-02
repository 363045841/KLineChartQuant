import type { KLineData, SymbolSpec, DataFetcher } from '../../controllers/types'
import { createSignal, type Signal } from '../../reactivity/signal'

const COMPARISON_PALETTE = [
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
]
const DEFAULT_COMPARISON_COLOR = '#f59e0b'
const BUF_COMPARISON = 'cmp'

export interface ComparisonHooks {
  createComparisonBuffer(
    spec: SymbolSpec,
  ): { key: string; buffer: import('../../data-fetchers/dataBufferTypes').KLineBuffer }
  disposeBuffer(key: string): void
  getKLineBuffer(key: string): import('../../data-fetchers/dataBufferTypes').KLineBuffer | undefined
  hasKLineBuffer(key: string): boolean
  getKLineBufferKeys(): string[]
  scheduleDraw(): void
}

export class ComparisonManager {
  private _specs: SymbolSpec[] = []
  private _data = new Map<string, KLineData[]>()
  private _colors: Map<string, string> = new Map()
  private _colorsSignal = createSignal<ReadonlyMap<string, string>>(new Map())
  private _loadingSignal = createSignal<boolean>(false)
  private _cmpLoadingUnsubs = new Map<string, () => void>()
  private _hooks: ComparisonHooks

  constructor(hooks: ComparisonHooks) {
    this._hooks = hooks
  }

  get specs(): SymbolSpec[] {
    return this._specs
  }

  get data(): Map<string, KLineData[]> {
    return this._data
  }

  get colorsSignal(): Signal<ReadonlyMap<string, string>> {
    return this._colorsSignal
  }

  get loadingSignal(): Signal<boolean> {
    return this._loadingSignal
  }

  getColors(): Map<string, string> {
    return this._colors
  }

  syncBuffers(specs: ReadonlyArray<SymbolSpec>, mainEarliest?: number): void {
    this._specs = [...specs]
    const nextKeys = new Set(specs.map((s) => s.symbol))

    for (const key of this._hooks.getKLineBufferKeys()) {
      if (!key.startsWith(BUF_COMPARISON)) continue
      const symbol = key.split(':')[1]!
      if (nextKeys.has(symbol)) continue
      this._hooks.disposeBuffer(key)
      this._data.delete(symbol)
    }

    for (const spec of specs) {
      const key = `cmp:${spec.symbol}:${spec.period ?? 'daily'}`
      const symbol = spec.symbol
      let buf = this._hooks.getKLineBuffer(key)
      if (!buf) {
        const created = this._hooks.createComparisonBuffer(spec)
        buf = created.buffer

        const b = buf
        const unsub = b.data.subscribe(() => {
          this._data.set(symbol, [...b.getRawData()])
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
    this._data.clear()
    this._colors.clear()
    this._colorsSignal.set(new Map())
    this._loadingSignal.set(false)
    this._specs = []
  }

  addSymbol(spec: SymbolSpec, onComplete: () => void): void {
    const symbol = spec.symbol

    for (const k of this._hooks.getKLineBufferKeys()) {
      if (k.startsWith(BUF_COMPARISON) && k.split(':')[1] === symbol) return
    }

    this._specs.push(spec)

    const color =
      COMPARISON_PALETTE[this._colors.size % COMPARISON_PALETTE.length] ??
      DEFAULT_COMPARISON_COLOR
    this._colors.set(symbol, color)
    this._colorsSignal.set(new Map(this._colors))

    const key = `cmp:${symbol}:${spec.period ?? 'daily'}`

    if (!this._hooks.hasKLineBuffer(key)) {
      const created = this._hooks.createComparisonBuffer(spec)
      const buf = created.buffer

      const unsub = buf.data.subscribe(() => {
        this._data.set(symbol, [...buf.getRawData()])
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
        this._data.set(symbol, [...buffer.getRawData()])
        this._hooks.scheduleDraw()
      })
      this._cmpLoadingUnsubs.set(key, unsub)

      const unsubLoading = buffer.loading.subscribe(() => this._recomputeLoading())
      this._cmpLoadingUnsubs.set(`loading:${key}`, unsubLoading)

      const color =
        COMPARISON_PALETTE[this._colors.size % COMPARISON_PALETTE.length] ??
        DEFAULT_COMPARISON_COLOR
      this._colors.set(symbol, color)
      this._colorsSignal.set(new Map(this._colors))

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
        found = true
        break
      }
    }
    if (!found) return false

    this._data.delete(symbol)
    this._colors.delete(symbol)
    this._colorsSignal.set(new Map(this._colors))
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
    this._loadingSignal.set(anyLoading)
  }
}