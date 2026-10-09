/** 图表实例级行情序列仓库：统一管理 K 线、分时和成交 Buffer 的身份、拓扑和生命周期。 */
import type { SymbolSpec } from '@/controllers/types.js'
import { createSignal, type ReadonlySignal } from '@/foundation/reactivity/signal.js'
import type { BarAggregation, KLineAdjustment, KLinePeriod } from '../../provider/types.js'
import { AUTO_SOURCE_ID } from '../../provider/types.js'
import type { TradeBuffer } from '../../trades/types.js'
import type { KLineBuffer, TimeShareBuffer } from '../types.js'

export type InstrumentKey = string
export type SourceId = string
export type BarSeriesKey = string
export type TradingDateKey = string

export const LATEST_TRADING_DATE: TradingDateKey = 'latest'

/** 序列选择判别字段字面量；判别种类时引用它，不在业务代码里散落字符串。 */
export const SERIES_SELECTION_KIND = {
  bars: 'bars',
  timeShare: 'timeShare',
  trades: 'trades',
} as const

/** 当前图表消费的强类型序列选择。 */
export type SeriesSelection =
  | {
      readonly kind: typeof SERIES_SELECTION_KIND.bars
      readonly instrumentKey: InstrumentKey
      readonly sourceId: SourceId
      readonly period: KLinePeriod
      readonly adjustment: KLineAdjustment
      readonly barAggregation: BarAggregation
    }
  | {
      readonly kind: typeof SERIES_SELECTION_KIND.timeShare
      readonly instrumentKey: InstrumentKey
      readonly sourceId: SourceId
      readonly tradingDate: TradingDateKey
    }

/** 原始成交按品种和来源复用，不绑定 K 线周期或足迹参数。 */
export interface TradesSelection {
  readonly kind: typeof SERIES_SELECTION_KIND.trades
  readonly instrumentKey: InstrumentKey
  readonly sourceId: SourceId
}

/** 仓库管理的输入包括图表序列及指标所需的原始成交。 */
type RepositorySelection = SeriesSelection | TradesSelection

/** 注册参数绑定选择种类和 Buffer 类型，避免运行时转换掩盖契约错误。 */
type SeriesRegistration =
  | (BarsSelection & { readonly buffer: KLineBuffer })
  | (TimeShareSelection & { readonly buffer: TimeShareBuffer })
  | (TradesSelection & { readonly buffer: TradeBuffer })

/** 按判别字段收窄后的 K 线选择。 */
export type BarsSelection = Extract<SeriesSelection, { kind: typeof SERIES_SELECTION_KIND.bars }>

/** 按判别字段收窄后的分时选择。 */
export type TimeShareSelection = Extract<
  SeriesSelection,
  { kind: typeof SERIES_SELECTION_KIND.timeShare }
>

/** 单个来源提供的 K 线与分时序列。 */
export interface SourceSeriesNode {
  readonly bars: ReadonlyMap<BarSeriesKey, KLineBuffer>
  readonly timeShare: ReadonlyMap<TradingDateKey, TimeShareBuffer>
  readonly trades?: TradeBuffer
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

/** 生成 K 线叶子键，周期、复权和聚合方式共同决定序列身份。 */
function barSeriesKey(
  period: KLinePeriod,
  adjustment: KLineAdjustment,
  barAggregation: BarAggregation,
): BarSeriesKey {
  return `${period}:${adjustment}:${barAggregation}`
}

/** 生成可用于订阅表和兼容诊断字段的稳定选择键。 */
export function seriesSelectionKey(selection: RepositorySelection): string {
  if (selection.kind === SERIES_SELECTION_KIND.trades)
    return JSON.stringify([selection.kind, selection.instrumentKey, selection.sourceId])
  return selection.kind === SERIES_SELECTION_KIND.bars
    ? JSON.stringify([
        selection.kind,
        selection.instrumentKey,
        selection.sourceId,
        selection.period,
        selection.adjustment,
        selection.barAggregation,
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

/** 空来源节点；注册与迁移共用同一个不可变空值。 */
const EMPTY_SOURCE_NODE: SourceSeriesNode = Object.freeze({
  bars: new Map<BarSeriesKey, KLineBuffer>(),
  timeShare: new Map<TradingDateKey, TimeShareBuffer>(),
})

/** 来源节点是否已不持有任何序列；成交只占单个槽位。 */
function isEmptySourceNode(node: SourceSeriesNode): boolean {
  return node.bars.size === 0 && node.timeShare.size === 0 && !node.trades
}

/** 构造来源节点；仅在有成交时携带该槽位，避免产生 undefined 字段。 */
function sourceNode(
  bars: ReadonlyMap<BarSeriesKey, KLineBuffer>,
  timeShare: ReadonlyMap<TradingDateKey, TimeShareBuffer>,
  trades?: TradeBuffer,
): SourceSeriesNode {
  return {
    bars: mapSnapshot(bars),
    timeShare: mapSnapshot(timeShare),
    ...(trades ? { trades } : {}),
  }
}

/** 返回写入注册叶子后的来源节点；成交是来源级单槽，直接覆盖。 */
function withLeaf(node: SourceSeriesNode, registration: SeriesRegistration): SourceSeriesNode {
  if (registration.kind === SERIES_SELECTION_KIND.bars) {
    const bars = new Map(node.bars)
    bars.set(
      barSeriesKey(registration.period, registration.adjustment, registration.barAggregation),
      registration.buffer,
    )
    return sourceNode(bars, node.timeShare, node.trades)
  }
  if (registration.kind === SERIES_SELECTION_KIND.timeShare) {
    const timeShare = new Map(node.timeShare)
    timeShare.set(registration.tradingDate, registration.buffer)
    return sourceNode(node.bars, timeShare, node.trades)
  }
  return sourceNode(node.bars, node.timeShare, registration.buffer)
}

/** 返回移除选择叶子后的来源节点；成交单槽不在叶子层裁剪。 */
function withoutLeaf(node: SourceSeriesNode, selection: RepositorySelection): SourceSeriesNode {
  if (selection.kind === SERIES_SELECTION_KIND.bars) {
    const bars = new Map(node.bars)
    bars.delete(barSeriesKey(selection.period, selection.adjustment, selection.barAggregation))
    return sourceNode(bars, node.timeShare, node.trades)
  }
  if (selection.kind === SERIES_SELECTION_KIND.timeShare) {
    const timeShare = new Map(node.timeShare)
    timeShare.delete(selection.tradingDate)
    return sourceNode(node.bars, timeShare, node.trades)
  }
  return { bars: node.bars, timeShare: node.timeShare }
}

/** 按判别种类读取来源节点中的叶子；成交是来源级单槽。 */
function readLeaf(
  node: SourceSeriesNode,
  selection: RepositorySelection,
): KLineBuffer | TimeShareBuffer | TradeBuffer | undefined {
  if (selection.kind === SERIES_SELECTION_KIND.bars)
    return node.bars.get(
      barSeriesKey(selection.period, selection.adjustment, selection.barAggregation),
    )
  if (selection.kind === SERIES_SELECTION_KIND.timeShare)
    return node.timeShare.get(selection.tradingDate)
  return node.trades
}

/** 统一拥有一个 Chart 实例内的所有行情 Buffer。 */
export class SeriesRepository {
  private readonly _snapshot = createSignal<SeriesRepositorySnapshot>(mapSnapshot())
  private readonly _disposedBuffers = new WeakSet<KLineBuffer | TimeShareBuffer | TradeBuffer>()
  private _disposed = false

  /** 返回只在拓扑变化时更新的只读快照。 */
  get snapshot(): ReadonlySignal<SeriesRepositorySnapshot> {
    return this._snapshot
  }

  /** 按完整 K 线身份查询 Buffer。 */
  getBars(selection: BarsSelection): KLineBuffer | undefined {
    return this.getSource(selection)?.bars.get(
      barSeriesKey(selection.period, selection.adjustment, selection.barAggregation),
    )
  }

  /** 按完整分时身份查询 Buffer。 */
  getTimeShare(selection: TimeShareSelection): TimeShareBuffer | undefined {
    return this.getSource(selection)?.timeShare.get(selection.tradingDate)
  }

  /** 查询任意判别选择对应的 Buffer。 */
  get(selection: SeriesSelection): KLineBuffer | TimeShareBuffer | undefined {
    return selection.kind === SERIES_SELECTION_KIND.bars
      ? this.getBars(selection)
      : this.getTimeShare(selection)
  }

  /** 查询同一来源品种唯一的成交快照。 */
  getTrades(selection: TradesSelection): TradeBuffer | undefined {
    return this.getSource(selection)?.trades
  }

  /** 成交沿用统一仓库的实例注册与销毁，不建立第二份品种注册表。 */
  getOrCreateTrades(selection: TradesSelection, create: () => TradeBuffer): TradeBuffer {
    const existing = this.getTrades(selection)
    if (existing && !existing.disposed) return existing
    const buffer = create()
    this.register({ ...selection, buffer })
    return buffer
  }

  /** 返回已有 K 线 Buffer，或创建并注册唯一实例。 */
  getOrCreateBars(selection: BarsSelection, create: () => KLineBuffer): KLineBuffer {
    const existing = this.getBars(selection)
    if (existing) return existing
    const buffer = create()
    this.register({ ...selection, buffer })
    return buffer
  }

  /** 返回已有分时 Buffer，或创建并注册唯一实例。 */
  getOrCreateTimeShare(
    selection: TimeShareSelection,
    create: () => TimeShareBuffer,
  ): TimeShareBuffer {
    const existing = this.getTimeShare(selection)
    if (existing) return existing
    const buffer = create()
    this.register({ ...selection, buffer })
    return buffer
  }

  /** 将 auto 叶子迁移到首次成功的实际来源节点，不复制或销毁 Buffer。 */
  moveToSource(selection: SeriesSelection, sourceId: SourceId): SourceMoveResult {
    const buffer = this.get(selection)
    if (!buffer) throw new Error('[SeriesRepository] source selection does not exist')
    const normalizedSourceId = sourceId.trim()
    if (!normalizedSourceId || normalizedSourceId === selection.sourceId)
      return { selection, buffer, moved: false }
    const next = { ...selection, sourceId: normalizedSourceId }
    const collision = this.get(next)
    if (collision && collision !== buffer) {
      this.delete(selection)
      return { selection: next, buffer: collision, moved: false }
    }

    const current = this._snapshot.peek()
    const instrument = current.get(selection.instrumentKey)!
    const sources = new Map(instrument.sources)
    const dropped = withoutLeaf(instrument.sources.get(selection.sourceId)!, selection)
    if (isEmptySourceNode(dropped)) sources.delete(selection.sourceId)
    else sources.set(selection.sourceId, dropped)
    const registration: SeriesRegistration =
      selection.kind === SERIES_SELECTION_KIND.bars
        ? { ...selection, buffer: this.getBars(selection)! }
        : { ...selection, buffer: this.getTimeShare(selection)! }
    sources.set(
      normalizedSourceId,
      withLeaf(sources.get(normalizedSourceId) ?? EMPTY_SOURCE_NODE, registration),
    )

    const snapshot = new Map(current)
    snapshot.set(selection.instrumentKey, { sources: mapSnapshot(sources) })
    this._snapshot.set(mapSnapshot(snapshot))
    return { selection: next, buffer, moved: true }
  }

  /** 删除指定叶子并销毁其 Buffer；空 source 和 instrument 节点同步移除。 */
  delete(selection: RepositorySelection): boolean {
    const source = this.getSource(selection)
    const buffer = source ? readLeaf(source, selection) : undefined
    if (!source || !buffer) return false
    this.disposeBuffer(buffer)
    this.replaceSourceNode(selection, withoutLeaf(source, selection))
    return true
  }

  /** 删除一个市场品种下的全部来源和序列。 */
  deleteInstrument(instrumentKey: InstrumentKey): boolean {
    const instrument = this._snapshot.peek().get(instrumentKey)
    if (!instrument) return false
    for (const source of instrument.sources.values()) {
      for (const buffer of source.bars.values()) this.disposeBuffer(buffer)
      for (const buffer of source.timeShare.values()) this.disposeBuffer(buffer)
      if (source.trades) this.disposeBuffer(source.trades)
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
  private getSource(selection: RepositorySelection): SourceSeriesNode | undefined {
    return this._snapshot.peek().get(selection.instrumentKey)?.sources.get(selection.sourceId)
  }

  /** 注册一个尚不存在的叶子 Buffer，并发布新的不可变拓扑。 */
  private register(selection: SeriesRegistration): void {
    if (this._disposed) throw new Error('[SeriesRepository] repository is disposed')
    if (this._disposedBuffers.has(selection.buffer)) {
      throw new Error('[SeriesRepository] disposed buffer cannot be registered again')
    }
    const node = this.getSource(selection) ?? EMPTY_SOURCE_NODE
    this.replaceSourceNode(selection, withLeaf(node, selection))
  }

  /** 用新的来源节点逐级替换 source、instrument 和仓库快照；空节点被移除。 */
  private replaceSourceNode(selection: RepositorySelection, node: SourceSeriesNode): void {
    const current = this._snapshot.peek()
    const instrument = current.get(selection.instrumentKey)
    const sources = new Map(instrument?.sources)
    if (isEmptySourceNode(node)) sources.delete(selection.sourceId)
    else sources.set(selection.sourceId, node)

    const next = new Map(current)
    if (sources.size === 0) next.delete(selection.instrumentKey)
    else next.set(selection.instrumentKey, { sources: mapSnapshot(sources) })
    this._snapshot.set(mapSnapshot(next))
  }

  /** 保证同一个 Buffer 最多执行一次 dispose。 */
  private disposeBuffer(buffer: KLineBuffer | TimeShareBuffer | TradeBuffer): void {
    if (this._disposedBuffers.has(buffer)) return
    this._disposedBuffers.add(buffer)
    buffer.dispose()
  }
}
