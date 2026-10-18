/** 主图数据 buffer 业务状态：activeBuffer、数据版本与 symbol 目录。 */

import type { SymbolInfo, SymbolSpec } from '../../controllers/types.js'
import {
  type BarsSelection,
  SERIES_SELECTION_KIND,
  type TimeShareSelection,
} from '../../data/buffer/impl/seriesRepository.js'
import type { TimeShareRange } from '../../data/provider/types.js'
import { EMPTY_TRADE_SNAPSHOT, type TradeSnapshot } from '../../data/trades/types.js'
import { batch, createSubState } from '../../foundation/reactivity/signal.js'
import type { KLineData, TimeShareData } from '../../foundation/types/price.js'
import type { ReadyMarketSession } from '../data/marketRuntime/types.js'

export interface DataDeps {
  /** placeholder — for future visibleRange computed */
}

/** 活动 Buffer 快照判别字段字面量；空态与两类序列共用同一取值来源。 */
export const ACTIVE_BUFFER_KIND = {
  empty: 'empty',
  bars: SERIES_SELECTION_KIND.bars,
  timeShare: SERIES_SELECTION_KIND.timeShare,
} as const

/** Kernel 中当前活动 Buffer 的原子业务快照。 */
type ActiveBufferSnapshot =
  | {
      readonly kind: typeof ACTIVE_BUFFER_KIND.empty
      readonly dataRevision: number
      readonly selection: null
      readonly data: ReadonlyArray<never>
      readonly loading: false
      readonly error: null
      readonly timezone: null
      readonly timeShareRange: null
      readonly timeSharePreClose: null
    }
  | {
      readonly kind: typeof ACTIVE_BUFFER_KIND.bars
      readonly dataRevision: number
      readonly selection: BarsSelection
      readonly data: ReadonlyArray<KLineData>
      readonly loading: boolean
      readonly error: string | null
      /** K 线服务端返回的时区。 */
      readonly timezone: string | null
      readonly timeShareRange: null
      readonly timeSharePreClose: null
    }
  | {
      readonly kind: typeof ACTIVE_BUFFER_KIND.timeShare
      readonly dataRevision: number
      readonly selection: TimeShareSelection
      readonly data: ReadonlyArray<TimeShareData>
      readonly loading: boolean
      readonly error: string | null
      /** 分时服务端返回的时区。 */
      readonly timezone: string | null
      readonly timeShareRange: TimeShareRange | null
      readonly timeSharePreClose: number | null
    }

/** 创建空活动快照。 */
function emptyActiveBufferSnapshot(): ActiveBufferSnapshot {
  return Object.freeze({
    kind: ACTIVE_BUFFER_KIND.empty,
    dataRevision: 0,
    selection: null,
    data: Object.freeze([]),
    loading: false,
    error: null,
    timezone: null,
    timeShareRange: null,
    timeSharePreClose: null,
  })
}

/** 写入活动数据时由 State 分配 revision，调用方不能伪造。 */
type ActiveBufferSnapshotInput = Omit<ActiveBufferSnapshot, 'dataRevision'>

/** 在保留判别联合类型的前提下，为外部快照分配 data revision。 */
function snapshotWithRevision(
  snapshot: ActiveBufferSnapshotInput,
  dataRevision: number,
): ActiveBufferSnapshot {
  return Object.freeze({ ...snapshot, dataRevision }) as ActiveBufferSnapshot
}

function snapshotSymbols(symbols: ReadonlyArray<SymbolSpec>): ReadonlyArray<SymbolSpec> {
  return Object.freeze(symbols.map((symbol) => Object.freeze({ ...symbol })))
}

export function createDataState(_deps: DataDeps = {}) {
  const { signals, readonly } = createSubState(
    {
      activeBuffer: emptyActiveBufferSnapshot(),
      readyMarket: null as ReadyMarketSession | null,
      trades: EMPTY_TRADE_SNAPSHOT,
      symbols: [] as ReadonlyArray<SymbolSpec>,
      symbolCatalog: [] as ReadonlyArray<SymbolInfo>,
    },
    {
      data: (s) => s.activeBuffer().data,
      loading: (s) => s.activeBuffer().loading,
      error: (s) => s.activeBuffer().error,
      activeSelection: (s) => s.activeBuffer().selection,
      timeShareRange: (s) => s.activeBuffer().timeShareRange,
      timeSharePreClose: (s) => s.activeBuffer().timeSharePreClose,
      dataLength: (s) => s.activeBuffer().data.length,
      dataRevision: (s) => s.activeBuffer().dataRevision,
    },
  )

  return {
    readonly,

    actions: {
      /** 行情运行模块发布主品种成交快照；显示模式只读取，不拥有订阅。 */
      setTrades(snapshot: TradeSnapshot): void {
        const previous = readonly.trades.peek()
        if (
          previous.status === snapshot.status &&
          previous.tickSize === snapshot.tickSize &&
          previous.message === snapshot.message &&
          previous.coverage === snapshot.coverage &&
          previous.latestTimestamp === snapshot.latestTimestamp &&
          previous.batches === snapshot.batches
        )
          return
        signals.trades.set(snapshot)
      },
      setSymbols(symbols: ReadonlyArray<SymbolSpec>) {
        signals.symbols.set(snapshotSymbols(symbols))
      },

      setSymbolCatalog(catalog: ReadonlyArray<SymbolInfo>) {
        signals.symbolCatalog.set(catalog)
      },

      /**
       * 发布完整活动 Buffer 快照，避免缓冲切换中间态。
       *
       * 换市场或周期时清空成交，保证新 K 线不会配到旧成交；即使新市场不提供原始逐笔成交、
       * 后续没有任何成交发布，空快照也是最终状态。
       *
       * 下面三处写入的顺序是载荷：清空必须排在 `readyMarket.set` 之前，且必须留在同一个 `batch` 内。
       * 行情运行模块观察到 `readyMarket` 变化后才会重新发布成交，而 `batch` 把通知推迟到最外层，
       * 重新发布因此必然落在清空之后。调换顺序或绕过 `batch` 会让刚发布的成交被清空，且不会报错。
       *
       * `readyMarket` 按引用比较，依赖 `ChartDataManager.readySession()` 在来源、品种与能力不变时
       * 复用同一实例：K 线数据更新不会清空成交。去掉那份缓存会让每次数据修订都清空足迹结果。
       *
       * @param snapshot - 活动 Buffer 的完整快照
       * @param readyMarket - 与快照同批发布的活动行情；null 表示尚未就绪
       */
      applyActiveBufferSnapshot(
        snapshot: ActiveBufferSnapshotInput,
        readyMarket: ReadyMarketSession | null = null,
      ) {
        const previous = readonly.activeBuffer.peek()
        const dataChanged =
          previous.selection !== snapshot.selection || previous.data !== snapshot.data
        const dataRevision = dataChanged ? previous.dataRevision + 1 : previous.dataRevision
        batch(() => {
          // 先清空再切换就绪行情，成交由行情运行模块在通知到达后重新发布。
          if (readonly.readyMarket.peek() !== readyMarket) signals.trades.set(EMPTY_TRADE_SNAPSHOT)
          signals.activeBuffer.set(snapshotWithRevision(snapshot, dataRevision))
          signals.readyMarket.set(readyMarket)
        })
      },

      reset() {
        batch(() => {
          signals.activeBuffer.set(emptyActiveBufferSnapshot())
          signals.readyMarket.set(null)
          signals.trades.set(EMPTY_TRADE_SNAPSHOT)
          signals.symbols.set([])
          signals.symbolCatalog.set([])
        })
      },
    },

    dispose() {
      this.actions.reset()
    },
  }
}

export type DataStateModule = ReturnType<typeof createDataState>
