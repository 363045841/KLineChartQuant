/** 分时数据缓冲：按交易日拉取并缓存分时点列，管理昨收元数据与加载/错误状态。 */
import { Effect, pipe } from 'effect'
import type { Effect as EffectType } from 'effect/Effect'

import type { SymbolSpec } from '../../controllers/types'
import {
  batch,
  computed,
  createSignal,
  type ReadonlySignal,
  type WritableSignal,
} from '../../foundation/reactivity/signal'
import type { TimeShareData } from '../../foundation/types/price'
import type { TimeShareRange } from '../provider/types'

import {
  FETCH_TOTAL_ATTEMPTS,
  fetchTimeShare,
  retryBackoffMs,
  TimeShareFetchService,
} from './dataBuffer.effects'
import type { DataBufferLike, DataWindow, DataChange, TimeShareResult } from './dataBufferTypes'

/** 由数据管理层注入的统一 Provider 分时请求。 */
export type TimeShareRequestFetch = (
  spec: SymbolSpec,
  date?: number,
) => Promise<TimeShareResult>

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  if (err != null && String(err).trim()) return String(err)
  return '加载失败'
}

// 按当前重试次数等待退避时间，避免请求连续打满上游。
function waitForRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, retryBackoffMs(attempt)))
}

/** 分时 Buffer 的唯一内容状态；扁平点列、窗口和昨收均从该快照派生。 */
type TimeShareContentSnapshot =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'inline'
      readonly data: ReadonlyArray<TimeShareData>
      readonly preClose: number | null
    }
  | { readonly kind: 'range'; readonly range: TimeShareRange }

const EMPTY_CONTENT: TimeShareContentSnapshot = Object.freeze({ kind: 'empty' })

/** 复制分时点，隔离调用方后续修改。 */
function copyPoint(point: TimeShareData): TimeShareData {
  return Object.freeze({ ...point })
}

/** 创建不可变的多日分时快照。 */
function copyRange(range: TimeShareRange): TimeShareRange {
  return Object.freeze({
    ...range,
    days: Object.freeze(
      range.days.map((day) =>
        Object.freeze({ ...day, data: Object.freeze(day.data.map(copyPoint)) }),
      ),
    ),
  })
}

/** 从唯一内容快照派生旧渲染链路需要的扁平点列。 */
function flattenContent(snapshot: TimeShareContentSnapshot): ReadonlyArray<TimeShareData> {
  if (snapshot.kind === 'empty') return []
  if (snapshot.kind === 'inline') return snapshot.data
  return Object.freeze(snapshot.range.days.flatMap((day) => day.data))
}

/** 从唯一内容快照派生涨跌基准。 */
function resolvePreClose(snapshot: TimeShareContentSnapshot): number | null {
  if (snapshot.kind === 'empty') return null
  if (snapshot.kind === 'inline') return snapshot.preClose
  return snapshot.range.days.at(-1)?.preClose ?? null
}

/** 从扁平点列派生已加载时间窗口。 */
function resolveLoadedWindow(data: ReadonlyArray<TimeShareData>): DataWindow | null {
  if (data.length === 0) return null
  return { earliestTs: data[0]!.timestamp, latestTs: data[data.length - 1]!.timestamp }
}

export class TimeShareBuffer implements DataBufferLike {
  // 内容快照是分时数据的唯一可写状态，其他业务值均由 computed 自动派生。
  private readonly _contentSignal = createSignal<TimeShareContentSnapshot>(EMPTY_CONTENT)
  private readonly _flatDataSignal = computed(() => flattenContent(this._contentSignal()))
  private readonly _dataSignal = computed<DataChange>(() => ({
    data: this._flatDataSignal(),
    prependedCount: 0,
  }))
  private readonly _rangeSignal = computed<TimeShareRange | null>(() => {
    const snapshot = this._contentSignal()
    return snapshot.kind === 'range' ? snapshot.range : null
  })
  private readonly _preCloseSignal = computed(() => resolvePreClose(this._contentSignal()))
  private readonly _loadedWindowSignal = computed(() => resolveLoadedWindow(this._flatDataSignal()))
  // 是否正在加载中，外部 UI 绑定用
  private _loadingSignal: WritableSignal<boolean> = createSignal<boolean>(false)
  private _lastError: WritableSignal<string | null> = createSignal<string | null>(null)
  private _requestFetch: TimeShareRequestFetch | null = null
  // 指定查询的历史日期（0 = 当天）
  private _queryDate = 0
  // 请求序号，每次 load() 递增；过期结果丢弃
  private _requestSeq = 0
  // 实例是否已销毁，阻止后续任何操作
  private _disposed = false

  /** 批量替换唯一内容快照，确保所有 computed 投影完成后再通知外部订阅者。 */
  private setContent(snapshot: TimeShareContentSnapshot): void {
    batch(() => this._contentSignal.set(snapshot))
  }

  get data(): ReadonlySignal<DataChange> {
    return this._dataSignal
  }

  /** 返回按日分组的只读响应式快照。 */
  get range(): ReadonlySignal<TimeShareRange | null> {
    return this._rangeSignal
  }

  get loading(): ReadonlySignal<boolean> {
    return this._loadingSignal
  }

  get lastError(): ReadonlySignal<string | null> {
    return this._lastError
  }

  get loadedWindow(): DataWindow | null {
    return this._loadedWindowSignal.peek()
  }

  getRawData(): TimeShareData[] {
    return [...this._flatDataSignal.peek()]
  }

  /** 返回多日分时分组快照。 */
  getRange(): TimeShareRange | null {
    return this._rangeSignal.peek()
  }

  /** 写入多日分时分组快照，并采用最新交易日昨收作为统一轴基准。 */
  setRange(range: TimeShareRange): void {
    if (this._disposed) return
    this._requestSeq++
    this.setContent({ kind: 'range', range: copyRange(range) })
    this._lastError.set(null)
    this._loadingSignal.set(false)
  }

  /** 设置统一 Provider 分时请求。 */
  setRequestFetch(fetcher: TimeShareRequestFetch | null): void {
    this._requestFetch = fetcher
  }

  setQueryDate(date: number): void {
    this._queryDate = date
  }

  getQueryDate(): number {
    return this._queryDate
  }

  getPreClose(): number | null {
    return this._preCloseSignal.peek()
  }

  /** 原子写入单日点列及昨收，拒绝无效的昨收值。 */
  setInlineData(data: ReadonlyArray<TimeShareData>, preClose: number | null): void {
    if (this._disposed) return
    if (preClose !== null && (!Number.isFinite(preClose) || preClose <= 0)) return
    this.setInlineSnapshot(data, preClose)
    this._lastError.set(null)
  }

  load(spec: SymbolSpec): void {
    if (this._disposed) return

    const requestSeq = ++this._requestSeq
    // 新请求开始即清空旧点、昨收与错误，避免历史日期切换时短暂显示另一天数据
    this.setContent(EMPTY_CONTENT)
    this._lastError.set(null)
    this._loadingSignal.set(true)

    const timeShareService: {
      readonly fetch: (s: SymbolSpec, date?: number) => EffectType<TimeShareResult, unknown>
    } = {
      fetch: (s, date) =>
        Effect.tryPromise({
          try: () => {
            if (!this._requestFetch) {
              return Promise.reject(new Error(`[TimeShareBuffer] request is not configured`))
            }
            return this._requestFetch(s, date)
          },
          catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        }),
    }

    const effect = pipe(
      fetchTimeShare(spec, this._queryDate || undefined),
      Effect.provideService(TimeShareFetchService, timeShareService),
    )

    void (async () => {
      try {
        let result: TimeShareResult | undefined
        for (let attempt = 1; attempt <= FETCH_TOTAL_ATTEMPTS; attempt++) {
          try {
            result = await Effect.runPromise(effect)
            break
          } catch (err) {
            if (this._disposed || requestSeq !== this._requestSeq) return
            if (attempt === FETCH_TOTAL_ATTEMPTS) throw err
            this._lastError.set(`${errorMessage(err)} Retry ${attempt}/${FETCH_TOTAL_ATTEMPTS}`)
            await waitForRetry(attempt)
          }
        }
        if (!result || this._disposed || requestSeq !== this._requestSeq) return
        this._queryDate = 0
        this.setInlineSnapshot(result.data, result.preClose)
        this._lastError.set(null)
      } catch (err) {
        if (this._disposed || requestSeq !== this._requestSeq) return
        this._lastError.set(errorMessage(err))
      } finally {
        if (requestSeq === this._requestSeq) {
          this._loadingSignal.set(false)
        }
      }
    })()
  }

  private setInlineSnapshot(data: ReadonlyArray<TimeShareData>, preClose: number | null): void {
    this.setContent({
      kind: 'inline',
      data: Object.freeze(data.map(copyPoint)),
      preClose,
    })
  }

  // 销毁实例
  dispose(): void {
    this._disposed = true
    this._requestSeq++
    this.setContent(EMPTY_CONTENT)
    this._lastError.set(null)
    this._loadingSignal.set(false)
  }
}
