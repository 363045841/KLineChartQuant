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
import type { InstrumentDescriptor } from '../provider/types'

import {
  FETCH_TOTAL_ATTEMPTS,
  fetchTimeShare,
  retryBackoffMs,
  TimeShareFetchService,
} from './dataBuffer.effects'
import type {
  DataBufferLike,
  LoadedTimeRange,
  DataChange,
  TimeShareRangeResult,
  TimeShareResult,
} from './dataBufferTypes'
import { AUTO_SOURCE_ID } from './seriesRepository'

/** 由数据管理层注入的统一 Provider 分时请求。 */
export type TimeShareRequestFetch = (spec: SymbolSpec, date?: number) => Promise<TimeShareResult>
/** 由数据管理层注入的统一 Provider 多日分时请求。 */
export type TimeShareRangeRequestFetch = (
  spec: SymbolSpec,
  days: number,
  date?: number,
) => Promise<TimeShareRangeResult>

/** 将未知异常转换为可展示的错误信息。 */
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

/** 从扁平点列派生已加载数据的时间范围。 */
function resolveLoadedTimeRange(data: ReadonlyArray<TimeShareData>): LoadedTimeRange | null {
  if (data.length === 0) return null
  return { earliestTs: data[0]!.timestamp, latestTs: data[data.length - 1]!.timestamp }
}

export class TimeShareBuffer implements DataBufferLike<TimeShareData> {
  // 内容快照是分时数据的唯一可写状态，其他业务值均由 computed 自动派生。
  private readonly _contentSignal = createSignal<TimeShareContentSnapshot>(EMPTY_CONTENT)
  private readonly _flatDataSignal = computed(() => flattenContent(this._contentSignal()))
  private readonly _dataSignal = computed<DataChange<TimeShareData>>(() => ({
    data: this._flatDataSignal(),
    prependedCount: 0,
  }))
  private readonly _rangeSignal = computed<TimeShareRange | null>(() => {
    const snapshot = this._contentSignal()
    return snapshot.kind === 'range' ? snapshot.range : null
  })
  private readonly _preCloseSignal = computed(() => resolvePreClose(this._contentSignal()))
  private readonly _loadedTimeRangeSignal = computed(() =>
    resolveLoadedTimeRange(this._flatDataSignal()),
  )
  // 是否正在加载中，外部 UI 绑定用
  private _loadingSignal: WritableSignal<boolean> = createSignal<boolean>(false)
  private _lastError: WritableSignal<string | null> = createSignal<string | null>(null)
  private _requestFetch: TimeShareRequestFetch | null = null
  private _rangeRequestFetch: TimeShareRangeRequestFetch | null = null
  private _sourceResolvedHandler:
    ((sourceId: string, instrument: InstrumentDescriptor) => boolean) | null = null
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

  get data(): ReadonlySignal<DataChange<TimeShareData>> {
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

  /** 返回当前已加载数据覆盖的时间范围。 */
  get loadedTimeRange(): LoadedTimeRange | null {
    return this._loadedTimeRangeSignal.peek()
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

  /** 设置统一 Provider 多日分时请求。 */
  setRangeRequestFetch(fetcher: TimeShareRangeRequestFetch | null): void {
    this._rangeRequestFetch = fetcher
  }

  /** 注册 auto 来源首次成功后的身份迁移回调。 */
  setSourceResolvedHandler(
    handler: ((sourceId: string, instrument: InstrumentDescriptor) => boolean) | null,
  ): void {
    this._sourceResolvedHandler = handler
  }

  /** 设置下次加载使用的历史查询日期，0 表示最新交易日。 */
  setQueryDate(date: number): void {
    this._queryDate = date
  }

  /** 返回当前待查询的交易日期。 */
  getQueryDate(): number {
    return this._queryDate
  }

  /** 返回当前内容快照派生的昨收价。 */
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

  /** 按当前查询日期请求分时数据，并丢弃已过期的响应。 */
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
        if (
          result.sourceId &&
          result.instrument &&
          (spec.source === undefined || spec.source === AUTO_SOURCE_ID)
        ) {
          if (this._sourceResolvedHandler?.(result.sourceId, result.instrument) === false) return
        }
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

  /** 按截止交易日请求多个实际交易日的分时，并原子写入分组快照。 */
  loadRange(spec: SymbolSpec, days: number): void {
    if (this._disposed || !Number.isInteger(days) || days < 1) return

    const requestSeq = ++this._requestSeq
    this.setContent(EMPTY_CONTENT)
    this._lastError.set(null)
    this._loadingSignal.set(true)

    void (async () => {
      try {
        let result: TimeShareRangeResult | undefined
        for (let attempt = 1; attempt <= FETCH_TOTAL_ATTEMPTS; attempt++) {
          try {
            if (!this._rangeRequestFetch) {
              throw new Error(`[TimeShareBuffer] range request is not configured`)
            }
            result = await this._rangeRequestFetch(spec, days, this._queryDate || undefined)
            break
          } catch (err) {
            if (this._disposed || requestSeq !== this._requestSeq) return
            if (attempt === FETCH_TOTAL_ATTEMPTS) throw err
            this._lastError.set(`${errorMessage(err)} Retry ${attempt}/${FETCH_TOTAL_ATTEMPTS}`)
            await waitForRetry(attempt)
          }
        }
        if (!result || this._disposed || requestSeq !== this._requestSeq) return
        if (
          result.sourceId &&
          result.instrument &&
          (spec.source === undefined || spec.source === AUTO_SOURCE_ID)
        ) {
          if (this._sourceResolvedHandler?.(result.sourceId, result.instrument) === false) return
        }
        this._queryDate = 0
        this.setContent({ kind: 'range', range: copyRange(result.range) })
        this._lastError.set(null)
      } catch (err) {
        if (this._disposed || requestSeq !== this._requestSeq) return
        this._lastError.set(errorMessage(err))
      } finally {
        if (requestSeq === this._requestSeq) this._loadingSignal.set(false)
      }
    })()
  }

  /** 将单日点列和昨收复制为不可变内容快照。 */
  private setInlineSnapshot(data: ReadonlyArray<TimeShareData>, preClose: number | null): void {
    this.setContent({
      kind: 'inline',
      data: Object.freeze(data.map(copyPoint)),
      preClose,
    })
  }

  /** 销毁实例并使进行中的请求结果失效。 */
  dispose(): void {
    this._disposed = true
    this._requestSeq++
    this.setContent(EMPTY_CONTENT)
    this._lastError.set(null)
    this._loadingSignal.set(false)
  }
}
