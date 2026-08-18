/** 图表实例级行情序列仓库：统一管理 K 线与分时 Buffer 的身份、拓扑和生命周期。 */
import type { SymbolSpec } from '../../controllers/types'
import { createSignal, type ReadonlySignal } from '../../foundation/reactivity/signal'
import type { KLineAdjustment, KLinePeriod } from '../provider/types'

import type { KLineBuffer, TimeShareBuffer } from './dataBufferTypes'

export type InstrumentKey = string
export type SourceId = string
export type BarSeriesKey = string
export type TradingDateKey = string

export const LATEST_TRADING_DATE: TradingDateKey = 'latest'
export const AUTO_SOURCE_ID: SourceId = 'auto'

/** 当前图表消费的强类型序列选择。 */
export type SeriesSelection =
  | {
      readonly kind: 'bars'
      readonly instrumentKey: InstrumentKey
      readonly sourceId: SourceId
      readonly period: KLinePeriod
      readonly adjustment: KLineAdjustment
    }
  | {
      readonly kind: 'timeShare'
      readonly instrumentKey: InstrumentKey
      readonly sourceId: SourceId
      readonly tradingDate: TradingDateKey
    }

/** 单个来源提供的 K 线与分时序列。 */
export interface SourceSeriesNode {
  readonly bars: ReadonlyMap<BarSeriesKey, KLineBuffer>
  readonly timeShare: ReadonlyMap<TradingDateKey, TimeShareBuffer>
}

/** 同一市场品种按实际数据来源隔离的数据集合。 */
export interface InstrumentSeriesNode {
  readonly sources: ReadonlyMap<SourceId, SourceSeriesNode>
}

/** 图表实例内全部行情序列的只读拓扑。 */
export type SeriesRepositorySnapshot = ReadonlyMap<InstrumentKey, InstrumentSeriesNode>

/** auto 来源解析后的叶子归属结果。 */
export interface SourceMoveResult {
  readonly selection: SeriesSelection
  readonly buffer: KLineBuffer | TimeShareBuffer
  readonly moved: boolean
}

/** 统一身份字段，去除首尾空白并避免分隔符碰撞。 */
function identityPart(value: string | undefined): string {
  return (value ?? '').trim().toUpperCase()
}

/** 从业务品种生成跨来源共享的市场身份。 */
export function instrumentKeyFromSpec(spec: SymbolSpec): InstrumentKey {
  const symbol = spec.instrument?.symbol ?? spec.symbol
  const exchange = spec.instrument?.exchange ?? spec.exchange
  return JSON.stringify([identityPart(spec.market), identityPart(exchange), identityPart(symbol)])
}

/** 读取请求指定的来源；未指定时以 auto 表达尚未路由的来源策略。 */
export function sourceIdFromSpec(spec: SymbolSpec): SourceId {
  const sourceId = spec.source ?? spec.instrument?.sourceId
  return sourceId?.trim() || AUTO_SOURCE_ID
}

/** 生成 K 线叶子键，周期与复权方式共同决定序列身份。 */
export function barSeriesKey(period: KLinePeriod, adjustment: KLineAdjustment): BarSeriesKey {
  return `${period}:${adjustment}`
}

/** 生成可用于订阅表和兼容诊断字段的稳定选择键。 */
export function seriesSelectionKey(selection: SeriesSelection): string {
  return selection.kind === 'bars'
    ? JSON.stringify([
        selection.kind,
        selection.instrumentKey,
        selection.sourceId,
        selection.period,
        selection.adjustment,
      ])
    : JSON.stringify([
        selection.kind,
        selection.instrumentKey,
        selection.sourceId,
        selection.tradingDate,
      ])
}

/** 将 Map 复制为只读快照，后续写入只能通过新的 Map 完成。 */
function mapSnapshot<K, V>(source?: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const copy = new Map(source)
  return new Proxy(copy, {
    get(target, property) {
      if (property === 'set' || property === 'delete' || property === 'clear') {
        return () => {
          throw new TypeError('SeriesRepository snapshot is immutable')
        }
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as ReadonlyMap<K, V>
}

/** 统一拥有一个 Chart 实例内的所有行情 Buffer。 */
export class SeriesRepository {
  private readonly _snapshot = createSignal<SeriesRepositorySnapshot>(mapSnapshot())
  private readonly _disposedBuffers = new WeakSet<KLineBuffer | TimeShareBuffer>()
  private _disposed = false

  /** 返回只在拓扑变化时更新的只读快照。 */
  get snapshot(): ReadonlySignal<SeriesRepositorySnapshot> {
    return this._snapshot
  }

  /** 按完整 K 线身份查询 Buffer。 */
  getBars(selection: Extract<SeriesSelection, { kind: 'bars' }>): KLineBuffer | undefined {
    return this.getSource(selection)?.bars.get(barSeriesKey(selection.period, selection.adjustment))
  }

  /** 按完整分时身份查询 Buffer。 */
  getTimeShare(
    selection: Extract<SeriesSelection, { kind: 'timeShare' }>,
  ): TimeShareBuffer | undefined {
    return this.getSource(selection)?.timeShare.get(selection.tradingDate)
  }

  /** 查询任意判别选择对应的 Buffer。 */
  get(selection: SeriesSelection): KLineBuffer | TimeShareBuffer | undefined {
    return selection.kind === 'bars' ? this.getBars(selection) : this.getTimeShare(selection)
  }

  /** 返回已有 K 线 Buffer，或创建并注册唯一实例。 */
  getOrCreateBars(
    selection: Extract<SeriesSelection, { kind: 'bars' }>,
    create: () => KLineBuffer,
  ): KLineBuffer {
    const existing = this.getBars(selection)
    if (existing) return existing
    const buffer = create()
    this.register(selection, buffer)
    return buffer
  }

  /** 返回已有分时 Buffer，或创建并注册唯一实例。 */
  getOrCreateTimeShare(
    selection: Extract<SeriesSelection, { kind: 'timeShare' }>,
    create: () => TimeShareBuffer,
  ): TimeShareBuffer {
    const existing = this.getTimeShare(selection)
    if (existing) return existing
    const buffer = create()
    this.register(selection, buffer)
    return buffer
  }

  /** 将 auto 叶子迁移到首次成功的实际来源节点，不复制或销毁 Buffer。 */
  moveToSource(selection: SeriesSelection, sourceId: SourceId): SourceMoveResult {
    const normalizedSourceId = sourceId.trim()
    if (!normalizedSourceId || normalizedSourceId === selection.sourceId) {
      const buffer = this.get(selection)
      if (!buffer) throw new Error('[SeriesRepository] source selection does not exist')
      return { selection, buffer, moved: false }
    }
    const buffer = this.get(selection)
    if (!buffer) throw new Error('[SeriesRepository] source selection does not exist')
    const next = { ...selection, sourceId: normalizedSourceId } as SeriesSelection
    const collision = this.get(next)
    if (collision && collision !== buffer) {
      this.delete(selection)
      return { selection: next, buffer: collision, moved: false }
    }

    const current = this._snapshot.peek()
    const instrument = current.get(selection.instrumentKey)!
    const oldSource = instrument.sources.get(selection.sourceId)!
    const oldBars = new Map(oldSource.bars)
    const oldTimeShare = new Map(oldSource.timeShare)
    if (selection.kind === 'bars') {
      oldBars.delete(barSeriesKey(selection.period, selection.adjustment))
    } else {
      oldTimeShare.delete(selection.tradingDate)
    }

    const targetSource = instrument.sources.get(normalizedSourceId)
    const targetBars = new Map(targetSource?.bars)
    const targetTimeShare = new Map(targetSource?.timeShare)
    if (selection.kind === 'bars') {
      targetBars.set(barSeriesKey(selection.period, selection.adjustment), buffer as KLineBuffer)
    } else {
      targetTimeShare.set(selection.tradingDate, buffer as TimeShareBuffer)
    }

    const sources = new Map(instrument.sources)
    if (oldBars.size === 0 && oldTimeShare.size === 0) sources.delete(selection.sourceId)
    else {
      sources.set(selection.sourceId, {
        bars: mapSnapshot(oldBars),
        timeShare: mapSnapshot(oldTimeShare),
      })
    }
    sources.set(normalizedSourceId, {
      bars: mapSnapshot(targetBars),
      timeShare: mapSnapshot(targetTimeShare),
    })
    const snapshot = new Map(current)
    snapshot.set(selection.instrumentKey, { sources: mapSnapshot(sources) })
    this._snapshot.set(mapSnapshot(snapshot))
    return { selection: next, buffer, moved: true }
  }

  /** 删除指定叶子并销毁其 Buffer；空 source 和 instrument 节点同步移除。 */
  delete(selection: SeriesSelection): boolean {
    const instrument = this._snapshot.peek().get(selection.instrumentKey)
    const source = instrument?.sources.get(selection.sourceId)
    if (!instrument || !source) return false

    const bars = new Map(source.bars)
    const timeShare = new Map(source.timeShare)
    const buffer =
      selection.kind === 'bars'
        ? bars.get(barSeriesKey(selection.period, selection.adjustment))
        : timeShare.get(selection.tradingDate)
    if (!buffer) return false

    if (selection.kind === 'bars') {
      bars.delete(barSeriesKey(selection.period, selection.adjustment))
    } else {
      timeShare.delete(selection.tradingDate)
    }
    this.disposeBuffer(buffer)
    this.replaceSource(selection, bars, timeShare)
    return true
  }

  /** 删除一个市场品种下的全部来源和序列。 */
  deleteInstrument(instrumentKey: InstrumentKey): boolean {
    const instrument = this._snapshot.peek().get(instrumentKey)
    if (!instrument) return false
    for (const source of instrument.sources.values()) {
      for (const buffer of source.bars.values()) this.disposeBuffer(buffer)
      for (const buffer of source.timeShare.values()) this.disposeBuffer(buffer)
    }
    const next = new Map(this._snapshot.peek())
    next.delete(instrumentKey)
    this._snapshot.set(mapSnapshot(next))
    return true
  }

  /** 销毁并清空仓库中的全部 Buffer。 */
  clear(): void {
    for (const instrumentKey of this._snapshot.peek().keys()) {
      this.deleteInstrument(instrumentKey)
    }
  }

  /** 永久销毁仓库，后续不再接受注册。 */
  dispose(): void {
    if (this._disposed) return
    this.clear()
    this._disposed = true
  }

  /** 读取 selection 对应的来源节点。 */
  private getSource(selection: SeriesSelection): SourceSeriesNode | undefined {
    return this._snapshot.peek().get(selection.instrumentKey)?.sources.get(selection.sourceId)
  }

  /** 注册一个尚不存在的叶子 Buffer，并发布新的不可变拓扑。 */
  private register(selection: SeriesSelection, buffer: KLineBuffer | TimeShareBuffer): void {
    if (this._disposed) throw new Error('[SeriesRepository] repository is disposed')
    if (this._disposedBuffers.has(buffer)) {
      throw new Error('[SeriesRepository] disposed buffer cannot be registered again')
    }

    const instrument = this._snapshot.peek().get(selection.instrumentKey)
    const source = instrument?.sources.get(selection.sourceId)
    const bars = new Map(source?.bars)
    const timeShare = new Map(source?.timeShare)
    if (selection.kind === 'bars') {
      bars.set(barSeriesKey(selection.period, selection.adjustment), buffer as KLineBuffer)
    } else {
      timeShare.set(selection.tradingDate, buffer as TimeShareBuffer)
    }
    this.replaceSource(selection, bars, timeShare)
  }

  /** 用新 Map 逐级替换 source、instrument 和仓库快照。 */
  private replaceSource(
    selection: SeriesSelection,
    bars: ReadonlyMap<BarSeriesKey, KLineBuffer>,
    timeShare: ReadonlyMap<TradingDateKey, TimeShareBuffer>,
  ): void {
    const current = this._snapshot.peek()
    const instrument = current.get(selection.instrumentKey)
    const sources = new Map(instrument?.sources)
    if (bars.size === 0 && timeShare.size === 0) {
      sources.delete(selection.sourceId)
    } else {
      sources.set(selection.sourceId, {
        bars: mapSnapshot(bars),
        timeShare: mapSnapshot(timeShare),
      })
    }

    const next = new Map(current)
    if (sources.size === 0) next.delete(selection.instrumentKey)
    else next.set(selection.instrumentKey, { sources: mapSnapshot(sources) })
    this._snapshot.set(mapSnapshot(next))
  }

  /** 保证同一个 Buffer 最多执行一次 dispose。 */
  private disposeBuffer(buffer: KLineBuffer | TimeShareBuffer): void {
    if (this._disposedBuffers.has(buffer)) return
    this._disposedBuffers.add(buffer)
    buffer.dispose()
  }
}
