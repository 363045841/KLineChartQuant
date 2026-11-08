/** K 线图表快照适配器：接收缓存查询结果并发布数据、加载与错误状态。 */
import type { KLineData, SymbolSpec } from '@/controllers/types.js'
import {
  createSignal,
  type ReadonlySignal,
  type WritableSignal,
} from '@/foundation/reactivity/signal.js'
import type { TradingCalendar } from '../../provider/types.js'
import { OLDER_DATA_STATUS, type OlderDataStatus } from '../../provider/types.js'
import type { DataChange, KLineBuffer, LoadedTimeRange } from '../types.js'
import { KLineDataStore, type UpdateBarsResult } from './kLineDataStore.js'
import { TradingCalendarStore } from './tradingCalendarStore.js'

/** 图表消费的 K 线快照；不负责 Provider 请求、重试或分页策略。 */
export class DataBuffer implements KLineBuffer {
  private readonly store = new KLineDataStore()
  private readonly calendar = new TradingCalendarStore()

  setTradingCalendar(calendar: TradingCalendar): boolean {
    if (this.disposed) return false
    const anchor = this.store.getRawData().at(-1)?.timestamp
    return anchor !== undefined && this.calendar.set(calendar, anchor)
  }

  coversTradingCalendar(count: number): boolean {
    const anchor = this.store.getRawData().at(-1)?.timestamp
    return anchor !== undefined && this.calendar.covers(anchor, count)
  }

  getFutureTimestamp(index: number): number | null {
    const data = this.store.getRawData()
    const anchor = data.at(-1)?.timestamp
    return anchor === undefined ? null : this.calendar.at(anchor, index - data.length)
  }
  private readonly loadingSignal: WritableSignal<boolean> = createSignal(false)
  private readonly errorSignal: WritableSignal<string | null> = createSignal<string | null>(null)
  private current: SymbolSpec | null = null
  private olderDataStatus: OlderDataStatus = OLDER_DATA_STATUS.UNKNOWN
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

  get olderData(): OlderDataStatus {
    return this.olderDataStatus
  }

  /** 返回服务端声明的当前 K 线序列时区。 */
  get timezone(): string | null {
    return this.currentTimezone
  }

  /** 返回当前快照覆盖的时间范围。 */
  get loadedTimeRange(): LoadedTimeRange | null {
    return this.store.loadedTimeRange
  }

  /** 返回图表当前 K 线快照；数组归 Buffer 所有，消费方不得修改。 */
  getRawData(): readonly KLineData[] {
    return this.store.getRawData()
  }

  /** 通过 Buffer 的唯一时间索引解析逻辑坐标。 */
  getLogicalIndexAtTimestamp(timestamp: number): number | null {
    return this.store.getLogicalIndexAtTimestamp(timestamp)
  }

  /** 通过 Buffer 的唯一时间索引解析稳定序号；跨 prepend 不变。 */
  getOrdinalAtTimestamp(timestamp: number): number | null {
    return this.store.getOrdinalAtTimestamp(timestamp)
  }

  /** 切换图表选择并清空旧快照；请求由上层缓存 API 发起。 */
  setSymbol(spec: SymbolSpec): void {
    if (this.disposed) return
    this.current = spec
    this.olderDataStatus = OLDER_DATA_STATUS.UNKNOWN
    this.currentTimezone = null
    this.store.reset()
    this.calendar.clear()
    this.errorSignal.set(null)
    this.loadingSignal.set(false)
  }

  /** 仅更新选择元数据，不触发请求或清空已有快照。 */
  setCurrentSpec(spec: SymbolSpec): void {
    if (!this.disposed) this.current = spec
  }

  /** 合并缓存层返回的一页历史或增量；既有时间戳不被分页改写。 */
  mergePage(data: ReadonlyArray<KLineData>, olderData: OlderDataStatus, timezone: string): void {
    if (this.disposed) return
    this.olderDataStatus = olderData
    this.currentTimezone = timezone
    this.store.mergePage(data)
    this.calendar.advance(this.store.getRawData().at(-1)?.timestamp ?? Number.NaN)
    this.errorSignal.set(null)
    this.loadingSignal.set(false)
  }

  /**
   * 原子应用实时 K 线批次，统一处理 forming 覆盖与 closed 后的新根追加。
   *
   * @param bars 服务端按时间顺序提供的实时 K 线；允许同一时间戳的后值覆盖前值。
   * @returns 本次追加、替换及拒绝的统计结果。
   */
  applyRealtimeBars(bars: ReadonlyArray<KLineData>): UpdateBarsResult {
    if (this.disposed) return { appendedCount: 0, replacedCount: 0, rejected: [...bars] }
    const result = this.store.applyRealtime(bars)
    this.calendar.advance(this.store.getRawData().at(-1)?.timestamp ?? Number.NaN)
    if (result.appendedCount > 0 || result.replacedCount > 0) {
      this.errorSignal.set(null)
    }
    return result
  }

  /** 发布缓存查询加载状态。 */
  setLoading(loading: boolean): void {
    if (!this.disposed) this.loadingSignal.set(loading)
  }

  /** 修正已加载历史，不改变序列身份和历史覆盖状态。 */
  correctBar(bar: KLineData): void {
    if (this.disposed) return
    this.store.correct(bar)
    this.errorSignal.set(null)
  }

  /** 整体替换当前序列；失效重查与静态数据共用这一条路径。 */
  replace(
    data: ReadonlyArray<KLineData>,
    olderData: OlderDataStatus,
    timezone: string | null,
  ): void {
    if (this.disposed) return
    this.olderDataStatus = olderData
    this.currentTimezone = timezone
    this.calendar.clear()
    this.store.replace(data)
    this.errorSignal.set(null)
    this.loadingSignal.set(false)
  }

  /** 发布缓存查询错误。 */
  setError(error: string | null): void {
    if (!this.disposed) {
      this.errorSignal.set(error)
      if (error) this.loadingSignal.set(false)
    }
  }

  /** 销毁图表快照。 */
  dispose(): void {
    this.disposed = true
    this.current = null
    this.olderDataStatus = OLDER_DATA_STATUS.UNKNOWN
    this.currentTimezone = null
    this.store.reset()
    this.calendar.clear()
    this.loadingSignal.set(false)
    this.errorSignal.set(null)
  }
}
