/** 分时图表快照适配器：接收缓存查询结果并发布点列、昨收与范围状态。 */
import {
  batch,
  computed,
  createSignal,
  type ReadonlySignal,
  type WritableSignal,
} from '@/foundation/reactivity/signal.js'
import type { TimeShareData } from '@/foundation/types/price.js'
import type { TimeShareRange } from '../../provider/types.js'

import {
  DATA_CHANGE_KINDS,
  type DataBufferLike,
  type DataChange,
  type LoadedTimeRange,
  type TimeShareBuffer as TimeShareBufferType,
} from '../types.js'
import { UniqueTimestampIndex } from './uniqueTimestampIndex.js'

type Content =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'inline'
      readonly data: ReadonlyArray<TimeShareData>
      readonly preClose: number | null
    }
  | { readonly kind: 'range'; readonly range: TimeShareRange }

const EMPTY_CONTENT: Content = Object.freeze({ kind: 'empty' })

/** 复制点列，隔离调用方对查询结果的后续修改。 */
function copyPoint(point: TimeShareData): TimeShareData {
  return Object.freeze({ ...point })
}

/** 按 timestamp 去重；同时间戳后写生效，与 K 线写入保持同一规则。 */
function normalizePoints(points: ReadonlyArray<TimeShareData>): TimeShareData[] {
  const byTimestamp = new Map<number, TimeShareData>()
  for (const point of points) byTimestamp.set(point.timestamp, copyPoint(point))
  return [...byTimestamp.values()]
}

/** 创建不可变的多日分时快照。 */
function copyRange(range: TimeShareRange): TimeShareRange {
  return Object.freeze({
    ...range,
    days: Object.freeze(
      range.days.map((day) =>
        Object.freeze({ ...day, data: Object.freeze(normalizePoints(day.data)) }),
      ),
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
  // 分时每次写入都是整段快照替换，点列下标不具备跨快照含义。
  private readonly dataSignal = computed<DataChange<TimeShareData>>(() => {
    const data = this.flatData()
    return {
      data,
      origin: 0,
      kind: DATA_CHANGE_KINDS.replace,
      start: 0,
      end: data.length,
    }
  })
  private readonly rangeSignal = computed<TimeShareRange | null>(() => {
    const content = this.content()
    return content.kind === 'range' ? content.range : null
  })
  /** 五日窗口统一使用第一交易日的昨收，与百分比轴和面积基准保持同一口径。 */
  private readonly preClose = computed(() => {
    const content = this.content()
    if (content.kind === 'inline') return content.preClose
    return content.kind === 'range' ? (content.range.days[0]?.preClose ?? null) : null
  })
  private readonly loadingSignal: WritableSignal<boolean> = createSignal(false)
  private readonly errorSignal: WritableSignal<string | null> = createSignal<string | null>(null)
  private queryDate = 0
  private disposed = false
  private readonly timestampIndex = new UniqueTimestampIndex()

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
    return data.length
      ? { earliestTs: data[0]!.timestamp, latestTs: data[data.length - 1]!.timestamp }
      : null
  }

  /** 返回当前扁平分时点列；数组归 Buffer 所有，消费方不得修改。 */
  getRawData(): readonly TimeShareData[] {
    return [...this.flatData.peek()]
  }

  /** 按唯一时间戳查找当前分时快照的逻辑索引。 */
  getLogicalIndexAtTimestamp(timestamp: number): number | null {
    return this.timestampIndex.getOrdinal(timestamp)
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
    const copiedRange = copyRange(range)
    batch(() => {
      this.content.set({ kind: 'range', range: copiedRange })
      this.timestampIndex.rebuild(
        copiedRange.days.flatMap((day) => day.data),
        0,
      )
    })
    this.errorSignal.set(null)
    this.loadingSignal.set(false)
  }

  /** 写入缓存层返回的单日分时快照。 */
  setInlineData(data: ReadonlyArray<TimeShareData>, preClose: number | null): void {
    if (this.disposed) return
    if (preClose !== null && (!Number.isFinite(preClose) || preClose <= 0)) return
    const copiedData = Object.freeze(normalizePoints(data))
    batch(() => {
      this.content.set({ kind: 'inline', data: copiedData, preClose })
      this.timestampIndex.rebuild(copiedData, 0)
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
    this.timestampIndex.rebuild([], 0)
    this.loadingSignal.set(false)
    this.errorSignal.set(null)
  }
}
