/**
 * useChartDocumentTitle —— 将图表主品种同步到浏览器 Tab 标题的预览侧组合式函数。
 * 标题格式为「代码 - 名称」；名称缺失或与代码相同则只显示代码。
 */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { onScopeDispose } from 'vue'

/** Tab 标题绑定句柄。 */
export interface ChartDocumentTitleBinding {
  /**
   * 绑定控制器；主品种变化时刷新标题，重复绑定会替换旧订阅。
   * @param controller 图表控制器
   */
  bind(controller: ChartController): void
}

/**
 * 创建主品种到浏览器 Tab 标题的同步器。
 * @returns 供编排层调用 bind 的绑定句柄
 */
export function useChartDocumentTitle(): ChartDocumentTitleBinding {
  // 首屏标题取自 index.html 初始值，无主品种时回退到该值，避免硬编码文案
  const baseTitle = document.title
  let unsubscribe: (() => void) | null = null

  /** 主品种格式化为「代码 - 名称」；名称缺失或与代码相同则仅代码。 */
  function format(controller: ChartController): string {
    const primary = controller.symbols.peek()[0]
    if (!primary) return baseTitle
    const name = primary.instrument?.name ?? primary.symbol
    return name && name !== primary.symbol ? `${primary.symbol} - ${name}` : primary.symbol
  }

  function bind(controller: ChartController): void {
    unsubscribe?.()
    const sync = () => {
      document.title = format(controller)
    }
    sync()
    unsubscribe = controller.symbols.subscribe(sync)
  }

  onScopeDispose(() => {
    unsubscribe?.()
    unsubscribe = null
    document.title = baseTitle
  })

  return { bind }
}
