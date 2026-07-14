import { batch, createSubState, type ReadonlySignal } from '../../foundation/reactivity/signal'
import type { SymbolSpec, SymbolInfo } from '../../controllers/types'

export interface DataDeps {
  /** placeholder — for future visibleRange computed */
}

function snapshotSymbols(symbols: ReadonlyArray<SymbolSpec>): ReadonlyArray<SymbolSpec> {
  return Object.freeze(symbols.map((symbol) => Object.freeze({ ...symbol })))
}

export function createDataState(_deps: DataDeps = {}) {
  const { signals, readonly } = createSubState(
    {
      data: [] as ReadonlyArray<unknown>,
      loading: false,
      symbols: [] as ReadonlyArray<SymbolSpec>,
      symbolCatalog: [] as ReadonlyArray<SymbolInfo>,
      activeBufferKey: null as string | null,
    },
    {
      dataLength: (s) => s.data().length,
    },
  )

  return {
    readonly,

    actions: {
      setData(data: ReadonlyArray<unknown>) {
        signals.data.set(data)
      },

      setLoading(loading: boolean) {
        signals.loading.set(loading)
      },

      setSymbols(symbols: ReadonlyArray<SymbolSpec>) {
        signals.symbols.set(snapshotSymbols(symbols))
      },

      setSymbolCatalog(catalog: ReadonlyArray<SymbolInfo>) {
        signals.symbolCatalog.set(catalog)
      },

      setActiveBufferKey(key: string | null) {
        signals.activeBufferKey.set(key)
      },

      /** key/data/loading 同批发布，避免缓冲切换中间态 */
      applyActiveBufferSnapshot(snapshot: {
        key: string | null
        data: ReadonlyArray<unknown>
        loading: boolean
      }) {
        batch(() => {
          signals.activeBufferKey.set(snapshot.key)
          signals.data.set(snapshot.data)
          signals.loading.set(snapshot.loading)
        })
      },

      reset() {
        batch(() => {
          signals.data.set([])
          signals.loading.set(false)
          signals.activeBufferKey.set(null)
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
