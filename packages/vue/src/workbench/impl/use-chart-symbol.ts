/**
 * 图表品种的 Vue 桥接。
 *
 * Core 的 `agent.context` 是 ReadonlySignal：直接在 Vue 的 computed 里调用它不会建立依赖，
 * 换品种后 computed 会一直返回第一次的值——面板与 Agent 于是停在上一个品种上。
 * 这里用 useSignalSource 订阅，把品种落到一个 shallowRef，面板只依赖这个 ref。
 */
import type { ReadonlySignal } from '@363045841yyt/klinechart-core/reactivity'
import { type ComputedRef, computed, shallowRef, watch } from 'vue'
import { normalizeOrderflowSymbol } from '../../features/orderflow/impl/orderflow-snapshot-tool.js'
import { useSignalSource } from '../../utils/signalBridge.js'

/**
 * 图表还没有品种时的回落品种。
 *
 * 行情后端没起、或图表还在加载时面板本身仍然可用；面板顶部始终显示当前品种，
 * 所以回落到 BTCUSDT 不会让人误以为在看别的币。
 */
export const DEFAULT_CHART_SYMBOL = 'BTCUSDT'

/** 只需要 `agent.context` 一个字段；宿主的控制器结构兼容即可。 */
export interface ChartSymbolProvider {
  readonly agent: { readonly context: ReadonlySignal<unknown> }
}

/**
 * 从上下文快照里读品种代码。
 *
 * @param snapshot 上下文快照
 * @returns 品种代码；结构不符时返回 null
 */
function symbolOf(snapshot: unknown): string | null {
  if (typeof snapshot !== 'object' || snapshot === null) return null
  const value: unknown = Reflect.get(snapshot, 'symbol')
  return typeof value === 'string' ? value : null
}

/**
 * 订阅图表当前品种，并去掉永续展示后缀（`BTCUSDT.P` → `BTCUSDT`）。
 *
 * 换品种的瞬间上下文会短暂为 null（新数据还没到）；这时保留上一个品种，
 * 避免面板闪回默认品种再切回来。
 *
 * @param controller 取宿主控制器；未挂载时返回 null
 * @returns 响应式的交易对代码
 */
export function useChartSymbol(controller: () => ChartSymbolProvider | null): ComputedRef<string> {
  const context = useSignalSource(
    () => controller()?.agent.context,
    (snapshot) => snapshot,
    () => null,
  )
  const symbol = shallowRef<string | null>(null)
  watch(
    context,
    (snapshot) => {
      const normalized = normalizeOrderflowSymbol(symbolOf(snapshot))
      if (normalized !== null) symbol.value = normalized
    },
    { immediate: true },
  )
  return computed(() => symbol.value ?? DEFAULT_CHART_SYMBOL)
}
