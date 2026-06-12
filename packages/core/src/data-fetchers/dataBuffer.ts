import { createSignal, type Signal } from '../reactivity/signal'
import type { DataFetcher, KLineData, SymbolSpec } from '../controllers/types'

export interface DataWindow {
    earliestTs: number
    latestTs: number
}

const MS_PER_DAY = 86_400_000
const INITIAL_LOAD_DAYS = 365
const INCREMENTAL_LOAD_DAYS = 90

function formatDate(ts: number): string {
    const d = new Date(ts)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function mergeSortedData(
    existing: KLineData[],
    incoming: KLineData[],
): KLineData[] {
    if (existing.length === 0) return [...incoming]
    if (incoming.length === 0) return [...existing]

    const tsSet = new Set<number>(existing.map((d) => d.timestamp))
    const unique = incoming.filter((d) => !tsSet.has(d.timestamp))
    if (unique.length === 0) return existing

    const merged = [...existing, ...unique]
    merged.sort((a, b) => a.timestamp - b.timestamp)
    return merged
}

export class DataBuffer {
    private _data: KLineData[] = []
    private _dataSignal: Signal<ReadonlyArray<KLineData>>
    private _loadingSignal: Signal<boolean>
    private _fetcher: DataFetcher | null = null
    private _currentSpec: SymbolSpec | null = null
    private _loadedWindow: DataWindow | null = null
    private _pendingFetch: Promise<void> | null = null
    private _disposed = false

    onPrepend: ((count: number) => void) | null = null

    constructor() {
        this._dataSignal = createSignal<ReadonlyArray<KLineData>>([])
        this._loadingSignal = createSignal<boolean>(false)
    }

    get data(): Signal<ReadonlyArray<KLineData>> {
        return this._dataSignal
    }

    get loading(): Signal<boolean> {
        return this._loadingSignal
    }

    get loadedWindow(): DataWindow | null {
        return this._loadedWindow
    }

    setFetcher(fetcher: DataFetcher | null): void {
        this._fetcher = fetcher
    }

    setSymbol(spec: SymbolSpec): void {
        this._currentSpec = spec
        this._data = []
        this._loadedWindow = null
        this._dataSignal.set([])
        this.loadInitial()
    }

    ensureRange(requestStartTs: number, _requestEndTs: number): void {
        if (this._disposed || !this._fetcher || !this._currentSpec) return
        if (!this._loadedWindow) return

        if (requestStartTs >= this._loadedWindow.earliestTs) return

        const incrementalStart = requestStartTs - INCREMENTAL_LOAD_DAYS * MS_PER_DAY
        const incrementalEnd = this._loadedWindow.earliestTs

        if (incrementalEnd <= incrementalStart) return

        this.fetchRange(incrementalStart, incrementalEnd)
    }

    private loadInitial(): void {
        if (!this._fetcher || !this._currentSpec || this._disposed) return

        const now = Date.now()
        const startDate = now - INITIAL_LOAD_DAYS * MS_PER_DAY
        const endDate = now

        this.fetchRange(startDate, endDate)
    }

    private fetchRange(startTs: number, endTs: number): void {
        if (!this._fetcher || !this._currentSpec || this._disposed) return

        if (this._pendingFetch) {
            this._pendingFetch = this._pendingFetch.then(() => {
                if (this._disposed) return
                this.fetchRange(startTs, endTs)
            })
            return
        }

        const spec = this._currentSpec
        const fetcher = this._fetcher

        this._loadingSignal.set(true)

        this._pendingFetch = fetcher(spec.source ?? 'baostock', {
            symbol: spec.symbol,
            startDate: formatDate(startTs),
            endDate: formatDate(endTs),
            period: spec.period ?? 'daily',
            adjust: spec.adjust ?? 'none',
        })
            .then((incoming) => {
                if (this._disposed) return

                const oldLength = this._data.length
                const oldEarliestTs = oldLength > 0 ? this._data[0]!.timestamp : null
                const merged = mergeSortedData(this._data, [...incoming])

                if (oldLength > 0 && merged.length > oldLength && oldEarliestTs !== null) {
                    const newEarliestTs = merged[0]!.timestamp
                    if (newEarliestTs < oldEarliestTs) {
                        const prependCount = merged.findIndex((d) => d.timestamp === oldEarliestTs)
                        if (prependCount > 0) {
                            this.onPrepend?.(prependCount)
                        }
                    }
                }

                this._data = merged
                this._dataSignal.set([...merged])

                if (merged.length > 0) {
                    const newEarliest = merged[0]!.timestamp
                    const newLatest = merged[merged.length - 1]!.timestamp
                    if (!this._loadedWindow) {
                        this._loadedWindow = { earliestTs: newEarliest, latestTs: newLatest }
                    } else {
                        this._loadedWindow = {
                            earliestTs: Math.min(this._loadedWindow.earliestTs, newEarliest),
                            latestTs: Math.max(this._loadedWindow.latestTs, newLatest),
                        }
                    }
                }
            })
            .catch((err) => {
                if (this._disposed) return
                console.error('[DataBuffer] fetch failed:', err)
            })
            .finally(() => {
                this._pendingFetch = null
                if (!this._disposed) {
                    this._loadingSignal.set(false)
                }
            })
    }

    dispose(): void {
        this._disposed = true
        this._pendingFetch = null
        this._data = []
        this._loadedWindow = null
    }
}
