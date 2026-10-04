/** 原生比较入口：仅增删比较折线，不改写主品种或图表模式。 */
import type { ChartController, SymbolSpec } from '@363045841yyt/klinechart-core/controllers'
import type { SymbolItem } from '../../components/SymbolSelector.vue'

/** 比较入口需要的主图上下文与错误反馈。 */
interface ComparisonSymbolsOptions {
  getController(): ChartController | null
  getPrimary(): SymbolSpec | null
  toSpec(item: SymbolItem): SymbolSpec
  onError(item: SymbolItem, error: unknown): void
}

/** 将比较选择器事件委托给 core 的原生比较命令。 */
export function useComparisonSymbols(options: ComparisonSymbolsOptions) {
  /** 只添加用户选择的比较品种，主品种仍由 K 线渲染器独立展示。 */
  function add(item: SymbolItem): void {
    const controller = options.getController()
    if (!controller) return
    try {
      controller.addComparisonSymbol(options.toSpec(item), options.getPrimary())
    } catch (error) {
      options.onError(item, error)
    }
  }

  /** 移除指定折线，不修改主品种选择。 */
  function remove(identity: string): void {
    options.getController()?.removeComparisonSymbol(identity)
  }
  return { add, remove }
}
