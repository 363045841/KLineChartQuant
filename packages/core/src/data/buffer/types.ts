/** 数据缓冲层共享契约：已加载窗口、统一的数据变更描述与 K 线/分时缓冲接口。 */
import type { KLineData, SymbolSpec } from '../../controllers/types.js'
import type { ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { TimeShareData } from '../../foundation/types/price.js'
import type { OlderDataStatus, TimeShareRange } from '../provider/types.js'

import type { UpdateBarsResult } from './impl/kLineDataStore.js'

/** 已加载行情数据覆盖的时间范围。 */
export interface LoadedTimeRange {
  earliestTs: number
  latestTs: number
}

/**
 * 数据变更种类的取名字面量；类型与取值同源，业务代码只引用常量，禁止散落字符串。
 */
export const DATA_CHANGE_KINDS = Object.freeze({
  replace: 'replace',
  prepend: 'prepend',
  append: 'append',
  tail: 'tail',
  correct: 'correct',
} as const)

/**
 * 数据变更种类，表达本次写入影响了哪一段序列。
 *
 * - replace：整体替换，全部旧下标与序号失效
 * - prepend：头部插入历史，既有序号不变、逻辑下标后移
 * - append：尾部追加，既有下标与序号都不变
 * - tail：实时尾段修订或追加，既有下标不变
 * - correct：单根历史修正，序列与序号都不变
 */
export type DataChangeKind = (typeof DATA_CHANGE_KINDS)[keyof typeof DATA_CHANGE_KINDS]

/**
 * 数据变更描述：一次写入携带的完整快照与变化区间。
 *
 * `origin` 是新序列首元素的稳定序号；`prepend` 只让它变小，既有元素的序号不变。
 * `start`/`end` 是受影响区间（左闭右开，相对新序列），消费方只重算这一段。
 */
export interface DataChange<T> {
  readonly data: ReadonlyArray<T>
  /** 首元素的稳定序号；replace 重置为 0。 */
  readonly origin: number
  readonly kind: DataChangeKind
  /** 受影响区间起点，相对新序列。 */
  readonly start: number
  /** 受影响区间终点（不含），相对新序列。 */
  readonly end: number
}

export interface DataBufferLike<T = KLineData | TimeShareData> {
  readonly data: ReadonlySignal<DataChange<T>>
  readonly loading: ReadonlySignal<boolean>
  /** 最近一次显式拉取失败的可读原因；成功或重置后为 null */
  readonly lastError: ReadonlySignal<string | null>
  /** 当前已加载数据覆盖的时间范围。 */
  readonly loadedTimeRange: LoadedTimeRange | null
  /** 返回当前序列；数组归 Buffer 所有，消费方不得修改。 */
  getRawData(): readonly T[]
  dispose(): void
}

export interface KLineBuffer extends DataBufferLike<KLineData> {
  readonly currentSpec: SymbolSpec | null
  readonly olderData: OlderDataStatus
  /** 服务端返回的当前 K 线序列时区。 */
  readonly timezone: string | null
  getRawData(): readonly KLineData[]
  /** 按唯一时间戳解析当前快照中的逻辑索引；不存在时返回 null。 */
  getLogicalIndexAtTimestamp(timestamp: number): number | null
  /** 按唯一时间戳解析稳定序号；跨 prepend 不变。 */
  getOrdinalAtTimestamp(timestamp: number): number | null
  /** 缓存查询开始时发布加载状态。 */
  setLoading(loading: boolean): void
  /** 缓存查询失败时发布错误状态。 */
  setError(error: string | null): void
  /** 合并一页历史或增量；既有时间戳不被分页改写。 */
  mergePage(data: ReadonlyArray<KLineData>, olderData: OlderDataStatus, timezone: string): void
  /**
   * 原子应用一批实时 K 线：同时间戳替换尾部 K 线，新时间戳追加，陈旧帧拒绝。
   *
   * 收线帧与下一根 forming 帧应作为同一批传入，避免图表观察到中间状态。
   */
  applyRealtimeBars(bars: ReadonlyArray<KLineData>): UpdateBarsResult
  correctBar(bar: KLineData): void
  /** 整体替换当前序列；调用方提供完整数据，store 负责排序与唯一化。 */
  replace(data: ReadonlyArray<KLineData>, olderData: OlderDataStatus, timezone: string | null): void
  setSymbol(spec: SymbolSpec): void
  setCurrentSpec(spec: SymbolSpec): void
}

export interface TimeShareBuffer extends DataBufferLike<TimeShareData> {
  readonly range: ReadonlySignal<TimeShareRange | null>
  getRawData(): readonly TimeShareData[]
  /** 按唯一时间戳解析当前快照中的逻辑索引；不存在时返回 null。 */
  getLogicalIndexAtTimestamp(timestamp: number): number | null
  setInlineData(data: ReadonlyArray<TimeShareData>, preClose: number | null): void
  getRange(): TimeShareRange | null
  getPreClose(): number | null
  setRange(range: TimeShareRange): void
  /** 缓存查询开始或结束时发布加载状态。 */
  setLoading(loading: boolean): void
  /** 缓存查询失败时发布错误状态。 */
  setError(error: string | null): void
  setQueryDate(date: number): void
  getQueryDate(): number
}
