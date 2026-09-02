/** 分时图表快照适配器：接收缓存查询结果并发布点列、昨收与范围状态。 */
import {
  batch,
  computed,
  createSignal,
  type ReadonlySignal,
  type WritableSignal,
} from '../../foundation/reactivity/signal'
import type { TimeShareData } from '../../foundation/types/price'
import type { TimeShareRange } from '../provider/types'

import type { DataChange, DataBufferLike, LoadedTimeRange, TimeShareBuffer as TimeShareBufferType } from './dataBufferTypes'

type Content =
  | { readonly kind: 'empty' }
  | { readonly kind: 'inline'; readonly data: ReadonlyArray<TimeShareData>; readonly preClose: number | null }
  | { readonly kind: 'range'; readonly range: TimeShareRange }

const EMPTY_CONTENT: Content = Object.freeze({ kind: 'empty' })

/** 复制点列，隔离调用方对查询结果的后续修改。 */
function copyPoint(point: TimeShareData): TimeShareData {
  return Object.freeze({ ...point })
}

/** 创建不可变的多日分时快照。 */
function copyRange(range: TimeShareRange): TimeShareRange {
  return Object.freeze({
    ...range,
    days: Object.freeze(
      range.days.map((day) => Object.freeze({ ...day, data: Object.freeze(day.data.map(copyPoint)) })),
    ),
  })
}

/** 将单日或多日快照转换为渲染链路消费的扁平点列。 */
function flatten(content: Content): ReadonlyArray<TimeShareData> {
  if (content.kind === 'empty') return []
  if (content.kind === 'inline') return content.data
  return Object.freeze(content.range.days.flatMap((day) => day.data))
}

/** 分时图表快照；不负责 Provider 请求、重试或日期加载策略。 */
export class TimeShareBuffer implements TimeShareBufferType, DataBufferLike<TimeShareData> {
  private readonly content = createSignal<Content>(EMPTY_CONTENT)
  private readonly flatData = computed(() => flatten(this.content()))
  private readonly dataSignal = computed<DataChange<TimeShareData>>(() => ({
    data: this.flatData(),
    prependedCount: 0,
  }))
  private readonly rangeSignal = computed<TimeShareRange | null>(() => {
    const content = this.content()
    return content.kind === 'range' ? content.range : null
  })
  private readonly preClose = computed(() => {
    const content = this.content()
    if (content.kind === 'inline') return content.preClose
    return content.kind === 'range' ? (content.range.days.at(-1)?.preClose ?? null) : null
  })
  private readonly loadingSignal: WritableSignal<boolean> = createSignal(false)
  private readonly errorSignal: WritableSignal<string | null> = createSignal<string | null>(null)
  private queryDate = 0
  private disposed = false

  /** 返回数据变化快照。 */
  get data(): ReadonlySignal<DataChange<TimeShareData>> {
    return this.dataSignal
  }

  /** 返回多日分时快照。 */
  get range(): ReadonlySignal<TimeShareRange | null> {
    return this.rangeSignal
  }

  /** 返回缓存查询加载状态。 */
  get loading(): ReadonlySignal<boolean> {
    return this.loadingSignal
  }

  /** 返回最近一次缓存查询错误。 */
  get lastError(): ReadonlySignal<string | null> {
    return this.errorSignal
  }

  /** 返回数据覆盖范围。 */
  get loadedTimeRange(): LoadedTimeRange | null {
    const data = this.flatData.peek()
    return data.length ? { earliestTs: data[0]!.timestamp, latestTs: data[data.length - 1]!.timestamp } : null
  }

  /** 返回当前扁平分时点列。 */
  getRawData(): TimeShareData[] {
    return [...this.flatData.peek()]
  }

  /** 返回多日分时快照。 */
  getRange(): TimeShareRange | null {
    return this.rangeSignal.peek()
  }

  /** 返回当前分时涨跌基准。 */
  getPreClose(): number | null {
    return this.preClose.peek()
  }

  /** 写入缓存层返回的多日分时快照。 */
  setRange(range: TimeShareRange): void {
    if (this.disposed) return
    batch(() => this.content.set({ kind: 'range', range: copyRange(range) }))
    this.errorSignal.set(null)
    this.loadingSignal.set(false)
  }

  /** 写入缓存层返回的单日分时快照。 */
  setInlineData(data: ReadonlyArray<TimeShareData>, preClose: number | null): void {
    if (this.disposed) return
    if (preClose !== null && (!Number.isFinite(preClose) || preClose <= 0)) return
    batch(() => {
      this.content.set({ kind: 'inline', data: Object.freeze(data.map(copyPoint)), preClose })
    })
    this.errorSignal.set(null)
    this.loadingSignal.set(false)
  }

  /** 设置图表请求的历史日期标识。 */
  setQueryDate(date: number): void {
    if (!this.disposed) this.queryDate = date
  }

  /** 返回图表请求的历史日期标识。 */
  getQueryDate(): number {
    return this.queryDate
  }

  /** 发布缓存查询加载状态。 */
  setLoading(loading: boolean): void {
    if (!this.disposed) this.loadingSignal.set(loading)
  }

  /** 发布缓存查询错误。 */
  setError(error: string | null): void {
    if (!this.disposed) {
      this.errorSignal.set(error)
      if (error) this.loadingSignal.set(false)
    }
  }

  /** 清空图表快照。 */
  dispose(): void {
    this.disposed = true
    this.content.set(EMPTY_CONTENT)
    this.loadingSignal.set(false)
    this.errorSignal.set(null)
  }
}
