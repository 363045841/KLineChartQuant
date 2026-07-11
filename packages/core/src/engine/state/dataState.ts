import { createSubState, type ReadonlySignal } from '../../foundation/reactivity/signal'
import type { SymbolSpec, SymbolInfo } from '../../controllers/types'

export interface DataDeps {
  /** placeholder — for future visibleRange computed */
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
        signals.symbols.set(symbols)
      },

      setSymbolCatalog(catalog: ReadonlyArray<SymbolInfo>) {
        signals.symbolCatalog.set(catalog)
      },

      setActiveBufferKey(key: string | null) {
        signals.activeBufferKey.set(key)
      },

      reset() {
        signals.data.set([])
        signals.loading.set(false)
        signals.activeBufferKey.set(null)
      },
    },

    dispose() {
      signals.data.set([])
      signals.loading.set(false)
      signals.symbols.set([])
      signals.symbolCatalog.set([])
      signals.activeBufferKey.set(null)
    },
  }
}

export type DataStateModule = ReturnType<typeof createDataState>