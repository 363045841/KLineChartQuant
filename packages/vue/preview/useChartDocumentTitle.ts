/**
 * useChartDocumentTitle —— 将图表主品种与最新行情同步到浏览器 Tab 标题。
 * 标题格式为「symbol 价格 ▲/▼ 涨跌幅」；持平或涨跌未知时省略三角标记。
 */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { onScopeDispose } from 'vue'

/** Tab 标题绑定句柄。 */
export interface ChartDocumentTitleBinding {
  /**
   * 绑定控制器；主品种或行情变化时刷新标题，重复绑定会替换旧订阅。
   * @param controller 图表控制器
   */
  bind(controller: ChartController): void
}

/**
 * 创建主品种及行情到浏览器 Tab 标题的同步器。
 * @returns 供编排层调用 bind 的绑定句柄
 */
export function useChartDocumentTitle(): ChartDocumentTitleBinding {
  // 首屏标题取自 index.html 初始值，无主品种时回退到该值，避免硬编码文案
  const baseTitle = document.title
  let unsubscribe: (() => void) | null = null

  /** 拼接 symbol、最新收盘价、涨跌方向与涨跌幅；无有效行情时仅显示 symbol。 */
  function format(controller: ChartController): string {
    const primary = controller.symbols.peek()[0]
    if (!primary) return baseTitle
    const data = controller.data.peek()
    const latest = data.at(-1)
    if (!latest || !Number.isFinite(latest.close)) return primary.symbol

    // 优先沿用数据源的涨跌口径，未提供时比较相邻 K 线收盘价。
    const previous = data.at(-2)
    const changeAmount = latest.changeAmount ??
      (previous ? latest.close - previous.close : undefined)
    // 涨跌额对应的基准为当前价减涨跌额，确保与数据源涨跌口径一致。
    const referenceClose = changeAmount === undefined ? undefined : latest.close - changeAmount
    const changePercent = latest.changePercent ??
      (referenceClose !== undefined && referenceClose !== 0 && changeAmount !== undefined
        ? (changeAmount / referenceClose) * 100
        : undefined)
    const change = changePercent ?? changeAmount
    const direction =
      change !== undefined && Number.isFinite(change)
        ? change > 0
          ? ' ▲'
          : change < 0
            ? ' ▼'
            : ''
        : ''
    const percentTitle =
      changePercent !== undefined && Number.isFinite(changePercent)
        ? ` ${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`
        : ''
    return `${primary.symbol} ${latest.close}${direction}${percentTitle}`
  }

  /** 同时订阅品种与行情，并在重新绑定时释放全部旧订阅。 */
  function bind(controller: ChartController): void {
    unsubscribe?.()
    const sync = () => {
      document.title = format(controller)
    }
    sync()
    const subscriptions = [controller.symbols.subscribe(sync), controller.data.subscribe(sync)]
    unsubscribe = () => {
      for (const stop of subscriptions) stop()
    }
  }

  onScopeDispose(() => {
    unsubscribe?.()
    unsubscribe = null
    document.title = baseTitle
  })

  return { bind }
}
