import { DEFAULT_KLINE_PERIOD } from '../../data/provider/types.js'
import type { SymbolSpec } from '../../data/symbolSpec.js'
import { computed, type ReadonlySignal } from '../../foundation/reactivity/signal.js'

/** 品种和周期是活动选择的只读投影。 */
export function createDataManagerState(currentSpec: ReadonlySignal<SymbolSpec | null>) {
  return {
    readonly: {
      currentSpec,
      currentPeriod: computed(() => currentSpec()?.period ?? DEFAULT_KLINE_PERIOD),
    },
  }
}

export type DataManagerStateModule = ReturnType<typeof createDataManagerState>
