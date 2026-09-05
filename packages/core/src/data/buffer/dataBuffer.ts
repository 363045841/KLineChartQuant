/** K 线图表快照适配器：接收缓存查询结果并发布数据、加载与错误状态。 */
import type { KLineData, SymbolSpec } from '../../controllers/types'
import { createSignal, type ReadonlySignal, type WritableSignal } from '../../foundation/reactivity/signal'
import type { OlderDataStatus } from '../provider/types'

import type { DataChange, KLineBuffer, LoadedTimeRange } from './dataBufferTypes'
import { KLineDataStore } from './kLineDataStore'
import { TimeKeyIndex } from './timeKeyIndex'

/** 图表消费的 K 线快照；不负责 Provider 请求、重试或分页策略。 */
export class DataBuffer implements KLineBuffer {
  private readonly store = new KLineDataStore()
  private readonly keyIndex = new TimeKeyIndex()
  private readonly loadingSignal: WritableSignal<boolean> = createSignal(false)
  private readonly errorSignal: WritableSignal<string | null> = createSignal<string | null>(null)
  private current: SymbolSpec | null = null
  private currentTimezone: string | null = null
  private disposed = false

  /** 返回数据变化快照。 */
  get data(): ReadonlySignal<DataChange<KLineData>> {
    return this.store.data
  }

  /** 返回缓存查询加载状态。 */
  get loading(): ReadonlySignal<boolean> {
    return this.loadingSignal
  }

  /** 返回最近一次缓存查询错误。 */
  get lastError(): ReadonlySignal<string | null> {
    return this.errorSignal
  }

  /** 返回当前图表选择的品种描述。 */
  get currentSpec(): SymbolSpec | null {
    return this.current
  }

  /** 返回服务端声明的当前 K 线序列时区。 */
  get timezone(): string | null {
    return this.currentTimezone
  }

  /** 返回当前快照覆盖的时间范围。 */
  get loadedTimeRange(): LoadedTimeRange | null {
    return this.store.loadedTimeRange
  }

  /** 返回图表当前 K 线快照。 */
  getRawData(): KLineData[] {
    return this.store.getRawData()
  }

  /** 通过 Buffer 的唯一时间索引解析逻辑坐标。 */
  getLogicalIndexAtTimestamp(timestamp: number): number | null {
    return this.store.getLogicalIndexAtTimestamp(timestamp)
  }

  /** 返回月份索引，供时间轴快速定位。 */
  getMonthKeys(): Int32Array | null {
    return this.keyIndex.monthKeys
  }

  /** 返回交易日索引，供时间轴快速定位。 */
  getDayKeys(): Int32Array | null {
    return this.keyIndex.dayKeys
  }

  /** 切换图表选择并清空旧快照；请求由上层缓存 API 发起。 */
  setSymbol(spec: SymbolSpec): void {
    if (this.disposed) return
    this.current = spec
    this.currentTimezone = null
    this.store.reset()
    this.keyIndex.reset()
    this.errorSignal.set(null)
    this.loadingSignal.set(false)
  }

  /** 仅更新选择元数据，不触发请求或清空已有快照。 */
  setCurrentSpec(spec: SymbolSpec): void {
    if (!this.disposed) this.current = spec
  }

  /** 写入调用方提供的完整静态数据。 */
  setInlineData(data: ReadonlyArray<KLineData>): void {
    if (this.disposed) return
    this.currentTimezone = null
    this.store.setInlineData([...data])
    this.keyIndex.recompute(this.store.getRawData())
    this.errorSignal.set(null)
    this.loadingSignal.set(false)
  }

  /** 合并缓存层返回的分页结果并发布增量变更。 */
  mergeData(data: ReadonlyArray<KLineData>, _olderData: OlderDataStatus, timezone: string): void {
    if (this.disposed) return
    this.currentTimezone = timezone
    this.store.merge(data)
    this.keyIndex.recompute(this.store.getRawData())
    this.errorSignal.set(null)
    this.loadingSignal.set(false)
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

  /** 销毁图表快照与派生索引。 */
  dispose(): void {
    this.disposed = true
    this.current = null
    this.currentTimezone = null
    this.store.reset()
    this.keyIndex.reset()
    this.loadingSignal.set(false)
    this.errorSignal.set(null)
  }
}
