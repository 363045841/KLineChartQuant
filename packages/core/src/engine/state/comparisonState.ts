// 对比序列状态模块：对比品种集合是唯一业务 SSOT，颜色与加载状态随其管理。

import type { SymbolSpec } from '../../controllers/types.js'
import { batch, createSubState } from '../../foundation/reactivity/signal.js'
import { symbolSpecIdentityKey } from '../data/symbolIdentity.js'
import { immutableMap } from './immutable.js'

const COMPARISON_PALETTE = ['#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316']
const DEFAULT_COMPARISON_COLOR = '#f59e0b'

/** 快照化对比品种，冻结数组与元素防止外部改动 kernel 状态。 */
function snapshotSpecs(specs: ReadonlyArray<SymbolSpec>): ReadonlyArray<SymbolSpec> {
  return Object.freeze(specs.map((spec) => Object.freeze({ ...spec })))
}

/** 比较两个颜色映射是否逐项相等，避免无意义通知。 */
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

export function createComparisonState() {
  const { signals, readonly } = createSubState(
    {
      /** 对比品种唯一可写 SSOT，与 kline 主品种 state 无关。 */
      specs: [] as ReadonlyArray<SymbolSpec>,
      colors: immutableMap(new Map<string, string>()),
      hidden: immutableMap(new Map<string, boolean>()),
      loading: false,
    },
    {
      /** 是否选择了比较折线，由比较集合数量派生。 */
      active: (s) => s.specs().length > 0,
    },
  )

  return {
    readonly,

    actions: {
      /** 原子写回对比品种快照，调用方不得绕过此入口。 */
      setSpecs(specs: ReadonlyArray<SymbolSpec>) {
        const identities = new Set(specs.map(symbolSpecIdentityKey))
        batch(() => {
          signals.specs.set(snapshotSpecs(specs))
          signals.hidden.set(
            immutableMap(
              new Map([...signals.hidden.peek()].filter(([identity]) => identities.has(identity))),
            ),
          )
        })
      },

      /** 隐藏只影响折线可见性，保留选择、数据和图例以便恢复显示。 */
      setHidden(identity: string, hidden: boolean): void {
        if (!signals.specs.peek().some((spec) => symbolSpecIdentityKey(spec) === identity)) return
        const next = new Map(signals.hidden.peek())
        if (hidden) next.set(identity, true)
        else next.delete(identity)
        signals.hidden.set(immutableMap(next))
      },

      setColors(colors: ReadonlyMap<string, string>) {
        signals.colors.set(immutableMap(colors))
      },

      setLoading(loading: boolean) {
        signals.loading.set(loading)
      },

      /** 按当前对比品种补齐颜色；已有颜色沿用，缺失按调色板分配。 */
      syncColors(specs?: ReadonlyArray<SymbolSpec>) {
        const target = specs ?? signals.specs.peek()
        const prev = signals.colors.peek()
        const next = new Map<string, string>()
        for (const spec of target) {
          const identity = symbolSpecIdentityKey(spec)
          next.set(
            identity,
            prev.get(identity) ??
              COMPARISON_PALETTE[next.size % COMPARISON_PALETTE.length] ??
              DEFAULT_COMPARISON_COLOR,
          )
        }
        if (!colorsEqual(prev, next)) signals.colors.set(immutableMap(next))
      },

      /** 清空对比品种、颜色与加载状态。 */
      clear() {
        batch(() => {
          signals.specs.set([])
          signals.colors.set(immutableMap(new Map()))
          signals.hidden.set(immutableMap(new Map()))
          signals.loading.set(false)
        })
      },
    },

    dispose() {
      batch(() => {
        signals.specs.set([])
        signals.colors.set(immutableMap(new Map()))
        signals.hidden.set(immutableMap(new Map()))
        signals.loading.set(false)
      })
    },
  }
}

export type ComparisonStateModule = ReturnType<typeof createComparisonState>
