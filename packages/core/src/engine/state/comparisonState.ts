import {
  batch,
  computed,
  createSubState,
  type ReadonlySignal,
} from '../../foundation/reactivity/signal'
import type { SymbolSpec } from '../../controllers/types'
import { symbolSpecIdentityKey } from '../data/symbolIdentity'
import { immutableMap } from './immutable'

const COMPARISON_PALETTE = ['#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316']
const DEFAULT_COMPARISON_COLOR = '#f59e0b'

export interface ComparisonStateDeps {
  symbols$: ReadonlySignal<ReadonlyArray<SymbolSpec>>
}

function snapshotSpecs(specs: ReadonlyArray<SymbolSpec>): ReadonlyArray<SymbolSpec> {
  return Object.freeze(specs.map((spec) => Object.freeze({ ...spec })))
}

function colorsEqual(
  left: ReadonlyMap<string, string>,
  right: ReadonlyMap<string, string>,
): boolean {
  if (left.size !== right.size) return false
  for (const [symbol, color] of left) {
    if (right.get(symbol) !== color) return false
  }
  return true
}

export function createComparisonState(deps?: ComparisonStateDeps) {
  const { signals, readonly } = createSubState({
    colors: immutableMap(new Map<string, string>()),
    loading: false,
  })
  const specs = computed(() => snapshotSpecs(deps?.symbols$().slice(1) ?? []))

  return {
    readonly: { ...readonly, specs },
    actions: {
      setColors(colors: ReadonlyMap<string, string>) {
        signals.colors.set(immutableMap(colors))
      },
      setLoading(loading: boolean) {
        signals.loading.set(loading)
      },
      syncColors(specs: ReadonlyArray<SymbolSpec>) {
        const prev = signals.colors.peek()
        const next = new Map<string, string>()
        for (const spec of specs) {
          next.set(
            symbolSpecIdentityKey(spec),
            prev.get(symbolSpecIdentityKey(spec)) ??
              COMPARISON_PALETTE[next.size % COMPARISON_PALETTE.length] ??
              DEFAULT_COMPARISON_COLOR,
          )
        }
        if (!colorsEqual(prev, next)) signals.colors.set(immutableMap(next))
      },
      clear() {
        batch(() => {
          signals.colors.set(immutableMap(new Map()))
          signals.loading.set(false)
        })
      },
    },
    dispose() {
      batch(() => {
        signals.colors.set(immutableMap(new Map()))
        signals.loading.set(false)
      })
    },
  }
}

export type ComparisonStateModule = ReturnType<typeof createComparisonState>
