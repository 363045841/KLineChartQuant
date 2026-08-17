import { batch, createSubState, type ReadonlySignal } from '../../foundation/reactivity/signal'
import type { SymbolSpec, SymbolInfo } from '../../controllers/types'
import type { TimeShareRange } from '../../data/provider/types'

export interface DataDeps {
  /** placeholder — for future visibleRange computed */
}

/** Kernel 中当前活动 Buffer 的原子业务快照。 */
export interface ActiveBufferSnapshot {
  readonly key: string | null
  readonly data: ReadonlyArray<unknown>
  readonly loading: boolean
  readonly timeShareRange: TimeShareRange | null
  readonly timeSharePreClose: number | null
}

/** 创建空活动快照。 */
function emptyActiveBufferSnapshot(): ActiveBufferSnapshot {
  return Object.freeze({
    key: null,
    data: Object.freeze([]),
    loading: false,
    timeShareRange: null,
    timeSharePreClose: null,
  })
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
      activeBufferKey: (s) => s.activeBuffer().key,
      timeShareRange: (s) => s.activeBuffer().timeShareRange,
      timeSharePreClose: (s) => s.activeBuffer().timeSharePreClose,
      dataLength: (s) => s.activeBuffer().data.length,
    },
  )

  return {
    readonly,

    actions: {
      setData(data: ReadonlyArray<unknown>) {
        batch(() =>
          signals.activeBuffer.set(
            Object.freeze({
              ...signals.activeBuffer.peek(),
              data,
              timeShareRange: null,
              timeSharePreClose: null,
            }),
          ),
        )
      },

      setLoading(loading: boolean) {
        batch(() => signals.activeBuffer.set(Object.freeze({ ...signals.activeBuffer.peek(), loading })))
      },

      setSymbols(symbols: ReadonlyArray<SymbolSpec>) {
        signals.symbols.set(snapshotSymbols(symbols))
      },

      setSymbolCatalog(catalog: ReadonlyArray<SymbolInfo>) {
        signals.symbolCatalog.set(catalog)
      },

      setActiveBufferKey(key: string | null) {
        batch(() => signals.activeBuffer.set(Object.freeze({ ...signals.activeBuffer.peek(), key })))
      },

      /** key/data/loading 同批发布，避免缓冲切换中间态 */
      applyActiveBufferSnapshot(snapshot: ActiveBufferSnapshot) {
        batch(() => signals.activeBuffer.set(Object.freeze({ ...snapshot })))
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
