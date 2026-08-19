import { batch, createSubState } from '../../foundation/reactivity/signal'
import type { SymbolSpec, SymbolInfo } from '../../controllers/types'
import type { SeriesSelection } from '../../data/buffer/seriesRepository'
import type { TimeShareRange } from '../../data/provider/types'
import type { KLineData, TimeShareData } from '../../foundation/types/price'

export interface DataDeps {
  /** placeholder — for future visibleRange computed */
}

/** Kernel 中当前活动 Buffer 的原子业务快照。 */
export type ActiveBufferSnapshot =
  | {
      readonly kind: 'empty'
      readonly dataRevision: number
      readonly selection: null
      readonly data: ReadonlyArray<never>
      readonly loading: false
      readonly error: null
      readonly timeShareRange: null
      readonly timeSharePreClose: null
    }
  | {
      readonly kind: 'bars'
      readonly dataRevision: number
      readonly selection: Extract<SeriesSelection, { kind: 'bars' }>
      readonly data: ReadonlyArray<KLineData>
      readonly loading: boolean
      readonly error: string | null
      readonly timeShareRange: null
      readonly timeSharePreClose: null
    }
  | {
      readonly kind: 'timeShare'
      readonly dataRevision: number
      readonly selection: Extract<SeriesSelection, { kind: 'timeShare' }>
      readonly data: ReadonlyArray<TimeShareData>
      readonly loading: boolean
      readonly error: string | null
      readonly timeShareRange: TimeShareRange | null
      readonly timeSharePreClose: number | null
    }

/** 创建空活动快照。 */
function emptyActiveBufferSnapshot(): ActiveBufferSnapshot {
  return Object.freeze({
    kind: 'empty',
    dataRevision: 0,
    selection: null,
    data: Object.freeze([]),
    loading: false,
    error: null,
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
      setSymbols(symbols: ReadonlyArray<SymbolSpec>) {
        signals.symbols.set(snapshotSymbols(symbols))
      },

      setSymbolCatalog(catalog: ReadonlyArray<SymbolInfo>) {
        signals.symbolCatalog.set(catalog)
      },

      /** 发布完整活动 Buffer 快照，避免缓冲切换中间态。 */
      applyActiveBufferSnapshot(snapshot: ActiveBufferSnapshotInput) {
        const previous = readonly.activeBuffer.peek()
        const dataChanged =
          previous.selection !== snapshot.selection || previous.data !== snapshot.data
        const dataRevision = dataChanged ? previous.dataRevision + 1 : previous.dataRevision
        batch(() => signals.activeBuffer.set(snapshotWithRevision(snapshot, dataRevision)))
      },

      reset() {
        batch(() => {
          signals.activeBuffer.set(emptyActiveBufferSnapshot())
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
