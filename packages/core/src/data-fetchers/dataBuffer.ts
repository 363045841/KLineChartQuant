import { createSignal, type Signal } from '../reactivity/signal'
import type { DataFetcher, KLineData, SymbolSpec } from '../controllers/types'
import type { DataBufferLike } from './dataBufferTypes'

export interface DataWindow {
    earliestTs: number
    latestTs: number
}

const MS_PER_DAY = 86_400_000
const INITIAL_LOAD_DAYS = 365
const INCREMENTAL_LOAD_DAYS = 90
const FETCH_MAX_RETRIES = 2

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

export class DataBuffer implements DataBufferLike {
    private _data: KLineData[] = []
    private _dataSignal: Signal<ReadonlyArray<KLineData>>
    private _loadingSignal: Signal<boolean>
    private _fetcher: DataFetcher | null = null
    private _requestFetch: ((spec: SymbolSpec, startTs: number, endTs: number) => Promise<ReadonlyArray<KLineData>>) | null = null
    private _currentSpec: SymbolSpec | null = null
    private _loadedWindow: DataWindow | null = null
    private _pendingFetch: Promise<void> | null = null
    private _disposed = false
    private _attemptedBoundaries: Set<number> = new Set()

    onPrepend: ((count: number) => void) | null = null

    constructor() {
        this._dataSignal = createSignal<ReadonlyArray<KLineData>>([])
        this._loadingSignal = createSignal<boolean>(false)
    }

    get data(): Signal<ReadonlyArray<unknown>> {
        return this._dataSignal as Signal<ReadonlyArray<unknown>>
    }

    get loading(): Signal<boolean> {
        return this._loadingSignal
    }

    get currentSpec(): SymbolSpec | null {
        return this._currentSpec
    }

    get loadedWindow(): DataWindow | null {
        return this._loadedWindow
    }

    getRawData(): KLineData[] {
        return this._data
    }

    setFetcher(fetcher: DataFetcher | null): void {
        this._fetcher = fetcher
    }

    setRequestFetch(fn: ((spec: SymbolSpec, startTs: number, endTs: number) => Promise<ReadonlyArray<KLineData>>) | null): void {
        this._requestFetch = fn
    }

    setSymbol(spec: SymbolSpec, initialStartTs?: number): void {
        this._currentSpec = spec
        this._data = []
        this._loadedWindow = null
        this._attemptedBoundaries.clear()
        this._dataSignal.set([])
        if (initialStartTs !== undefined) {
            this.loadInitialRange(initialStartTs, Date.now())
        } else {
            this.loadInitial()
        }
    }

    ensureRange(requestStartTs: number, _requestEndTs: number): void {
        if (this._disposed || (!this._requestFetch && !this._fetcher) || !this._currentSpec) return
        if (!this._loadedWindow) return

        if (requestStartTs >= this._loadedWindow.earliestTs) return

        const incrementalEnd = this._loadedWindow.earliestTs

        if (this._attemptedBoundaries.has(incrementalEnd)) return

        this._attemptedBoundaries.add(incrementalEnd)
        this.fetchRange(requestStartTs, incrementalEnd)
    }

    private loadInitial(): void {
        if ((!this._requestFetch && !this._fetcher) || !this._currentSpec || this._disposed) return

        const now = Date.now()
        const startDate = now - INITIAL_LOAD_DAYS * MS_PER_DAY
        const endDate = now

        this.fetchRange(startDate, endDate)
    }

    private loadInitialRange(startTs: number, endTs: number): void {
        if ((!this._requestFetch && !this._fetcher) || !this._currentSpec || this._disposed) return
        this.fetchRange(startTs, endTs)
    }

    private fetchRange(startTs: number, endTs: number, retryCount = 0): void {
        if ((!this._requestFetch && !this._fetcher) || !this._currentSpec || this._disposed) return

        if (this._pendingFetch) {
            this._pendingFetch = this._pendingFetch.then(() => {
                if (this._disposed) return
                return this.fetchRange(startTs, endTs, retryCount)
            })
            return
        }

        const spec = this._currentSpec
        const fetcher = this._fetcher

        this._loadingSignal.set(true)

        const doFetch = (): Promise<void> => {
            const fetchPromise = this._requestFetch
                ? this._requestFetch(spec, startTs, endTs)
                : (fetcher as NonNullable<DataFetcher>)(spec.source ?? 'baostock', {
                    symbol: spec.symbol,
                    startDate: formatDate(startTs),
                    endDate: formatDate(endTs),
                    period: spec.period ?? 'daily',
                    adjust: spec.adjust ?? 'none',
                    exchange: spec.exchange,
                })
            return fetchPromise.then((incoming) => {
                if (this._disposed) return

                if (incoming.length === 0) {
                    throw new Error(
                        `[DataBuffer] empty data for ${spec.symbol} ${formatDate(startTs)}~${formatDate(endTs)}`,
                    )
                }

                const oldLength = this._data.length
                const oldEarliestTs = oldLength > 0 ? this._data[0]!.timestamp : null
                const merged = mergeSortedData(this._data, [...incoming])
                const newEarliestTs = merged[0]?.timestamp ?? null
                const advancedEarliest = oldEarliestTs !== null
                    && newEarliestTs !== null
                    && newEarliestTs < oldEarliestTs

                if (oldLength > 0 && merged.length > oldLength && advancedEarliest) {
                    const prependCount = merged.findIndex((d) => d.timestamp === oldEarliestTs)
                    if (prependCount > 0) {
                        this.onPrepend?.(prependCount)
                    }
                }

                if (oldLength > 0 && !advancedEarliest) {
                    this._attemptedBoundaries.delete(endTs)
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
        }

        const attempt = (count: number): Promise<void> => {
            return doFetch().catch((err) => {
                if (this._disposed) return

                if (count < FETCH_MAX_RETRIES) {
                    const delay = Math.pow(2, count) * 1000
                    console.warn(
                        `[DataBuffer] fetch failed, retry ${count + 1}/${FETCH_MAX_RETRIES} in ${delay}ms:`,
                        err,
                    )
                    return new Promise<void>((resolve) => setTimeout(resolve, delay)).then(() => {
                        if (this._disposed) return
                        return attempt(count + 1)
                    })
                }

                console.error(`[DataBuffer] fetch failed after ${FETCH_MAX_RETRIES + 1} attempts:`, err)
                this._attemptedBoundaries.delete(endTs)
            })
        }

        this._pendingFetch = attempt(retryCount).finally(() => {
            this._pendingFetch = null
            if (!this._disposed) {
                this._loadingSignal.set(false)
            }
        })
    }

    /**
     * Put the buffer in inline mode — use the provided data directly
     * instead of fetching. Sets data signal and tracks loadedWindow.
     */
    setInlineData(data: unknown[]): void {
        if (this._disposed) return
        const kData = data as KLineData[]
        this._data = [...kData]
        this._dataSignal.set([...kData])
        if (data.length > 0) {
            this._loadedWindow = {
                earliestTs: kData[0]!.timestamp,
                latestTs: kData[kData.length - 1]!.timestamp,
            }
        } else {
            this._loadedWindow = null
        }
        this._attemptedBoundaries.clear()
    }

    /**
     * Update just the spec metadata without triggering any fetch.
     */
    setCurrentSpec(spec: SymbolSpec): void {
        this._currentSpec = spec
    }

    dispose(): void {
        this._disposed = true
        this._pendingFetch = null
        this._data = []
        this._loadedWindow = null
        this._attemptedBoundaries.clear()
    }
}
