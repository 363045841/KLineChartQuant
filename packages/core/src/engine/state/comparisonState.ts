// 对比序列状态模块：对比品种集合是唯一业务 SSOT，颜色与加载状态随其管理。
import { batch, createSubState } from '../../foundation/reactivity/signal'
import type { SymbolSpec } from '../../controllers/types'
import { symbolSpecIdentityKey } from '../data/symbolIdentity'
import { immutableMap } from './immutable'

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
      loading: false,
      /** 对比参考序列（specs[0]）的已加载 bar 数；无主品种时驱动视口数据长度。 */
      referenceLength: 0,
    },
    {
      /** 对比视图是否激活由对比品种数量派生。 */
      active: (s) => s.specs().length > 0,
    },
  )

  return {
    readonly,

    actions: {
      /** 原子写回对比品种快照，调用方不得绕过此入口。 */
      setSpecs(specs: ReadonlyArray<SymbolSpec>) {
        signals.specs.set(snapshotSpecs(specs))
      },

      setColors(colors: ReadonlyMap<string, string>) {
        signals.colors.set(immutableMap(colors))
      },

      setLoading(loading: boolean) {
        signals.loading.set(loading)
      },

      /** 更新对比参考序列的 bar 数；无主品种时供视口计算可见区间。 */
      setReferenceLength(length: number) {
        signals.referenceLength.set(Number.isFinite(length) && length > 0 ? Math.floor(length) : 0)
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
          signals.loading.set(false)
          signals.referenceLength.set(0)
        })
      },
    },

    dispose() {
      batch(() => {
        signals.specs.set([])
        signals.colors.set(immutableMap(new Map()))
        signals.loading.set(false)
        signals.referenceLength.set(0)
      })
    },
  }
}

export type ComparisonStateModule = ReturnType<typeof createComparisonState>
