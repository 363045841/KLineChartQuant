import type { DataFetcher, SymbolSpec, KLineData } from '../../controllers/types'

interface PendingFetch {
  source: string
  spec: SymbolSpec
  startTs: number
  endTs: number
  resolve: (data: ReadonlyArray<KLineData>) => void
  reject: (err: Error) => void
}

function batchFormatDate(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const CONCURRENCY = 4

export class FetchBatchScheduler {
  private _fetcher: DataFetcher | null = null
  private _pending: Array<PendingFetch> = []
  private _flushScheduled = false

  setFetcher(fetcher: DataFetcher | null): void {
    this._fetcher = fetcher
  }

  getFetcher(): DataFetcher | null {
    return this._fetcher
  }

  createHandler(): (
    spec: SymbolSpec,
    startTs: number,
    endTs: number,
  ) => Promise<ReadonlyArray<KLineData>> {
    return (spec, startTs, endTs) =>
      new Promise<ReadonlyArray<KLineData>>((resolve, reject) => {
        if (!spec.source) {
          reject(
            new Error(
              `[DataFetcher] source is required but was not provided for symbol "${spec.symbol}"`,
            ),
          )
          return
        }
        this._pending.push({ source: spec.source, spec, startTs, endTs, resolve, reject })
        this._scheduleFlush()
      })
  }

  private _scheduleFlush(): void {
    if (this._flushScheduled) return
    this._flushScheduled = true
    Promise.resolve().then(() => this._flush())
  }

  private async _flush(): Promise<void> {
    this._flushScheduled = false
    const batch = this._pending.splice(0)
    if (batch.length === 0 || !this._fetcher) return
    const fetcher = this._fetcher
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY)
      await Promise.allSettled(
        chunk.map(({ source, spec, startTs, endTs, resolve, reject }) =>
          fetcher(source, {
            symbol: spec.symbol,
            startDate: batchFormatDate(startTs),
            endDate: batchFormatDate(endTs),
            period: spec.period ?? 'daily',
            adjust: spec.adjust ?? 'none',
            exchange: spec.exchange,
          }).then(resolve, reject),
        ),
      )
    }
  }
}